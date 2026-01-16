import { getDBWithMigration } from '../../utils/db'
import { getCurrentUser } from '../../utils/auth'
import { getR2Bucket, saveDocumentToR2 } from '../../utils/r2'
import { parseFilePath, ensureFolderPath } from '../../utils/path'

export default eventHandler(async (event) => {
  const startTime = Date.now()
  const requestId = crypto.randomUUID()

  console.log(`[PUT /api/documents/[id]] [${requestId}] 开始处理更新文档请求`)

  try {
    // 1. 验证用户身份
    console.log(`[PUT /api/documents/[id]] [${requestId}] 步骤1: 验证用户身份`)
    const user = await getCurrentUser(event)
    if (!user) {
      console.error(`[PUT /api/documents/[id]] [${requestId}] 用户未认证`)
      throw createError({
        statusCode: 401,
        message: 'Unauthorized'
      })
    }
    console.log(`[PUT /api/documents/[id]] [${requestId}] 用户认证成功: userId=${user.id}`)

    // 2. 获取文档ID
    const { id } = getRouterParams(event)
    console.log(`[PUT /api/documents/[id]] [${requestId}] 步骤2: 获取文档ID: id=${id}`)

    // 3. 读取请求体
    console.log(`[PUT /api/documents/[id]] [${requestId}] 步骤3: 读取请求体`)
    let body: any
    try {
      body = await readBody(event)
      console.log(`[PUT /api/documents/[id]] [${requestId}] 请求体读取成功:`, {
        title: body?.title,
        contentLength: body?.content?.length || 0
      })
    } catch (error: any) {
      console.error(`[PUT /api/documents/[id]] [${requestId}] 读取请求体失败:`, {
        message: error?.message,
        stack: error?.stack
      })
      throw createError({
        statusCode: 400,
        message: `Invalid request body: ${error?.message || 'Unknown error'}`
      })
    }

    const { title, content } = body

    // 4. 获取数据库连接并执行迁移检查
    console.log(`[PUT /api/documents/[id]] [${requestId}] 步骤4: 获取数据库连接`)
    let db: D1Database
    try {
      db = await getDBWithMigration(event)
      console.log(`[PUT /api/documents/[id]] [${requestId}] 数据库连接成功`)
    } catch (error: any) {
      console.error(`[PUT /api/documents/[id]] [${requestId}] 数据库不可用:`, error?.message)
      throw createError({
        statusCode: 500,
        message: 'Database not available'
      })
    }

    // 5. 检查文档是否存在且属于当前用户
    console.log(`[PUT /api/documents/[id]] [${requestId}] 步骤5: 检查文档是否存在`)
    let existing: any
    try {
      existing = await db.prepare(`
        SELECT id, r2_key, type, parent_id, title FROM documents WHERE id = ? AND user_id = ?
      `).bind(id, user.id).first() as any

      if (!existing) {
        console.error(`[PUT /api/documents/[id]] [${requestId}] 文档不存在或无权限: id=${id}`)
        throw createError({
          statusCode: 404,
          message: 'Document not found'
        })
      }
      console.log(`[PUT /api/documents/[id]] [${requestId}] 文档存在: type=${existing.type}`)
    } catch (error: any) {
      if (error.statusCode) {
        throw error
      }
      console.error(`[PUT /api/documents/[id]] [${requestId}] 检查文档时出错:`, {
        message: error?.message,
        stack: error?.stack
      })
      throw createError({
        statusCode: 500,
        message: `Failed to check document: ${error?.message || 'Unknown error'}`
      })
    }

    const now = Math.floor(Date.now() / 1000)
    let r2Key = existing.r2_key
    let newParentId = existing.parent_id

    // 6. 如果标题改变，解析新路径并更新
    if (title !== undefined && title.trim() !== existing.title) {
      console.log(`[PUT /api/documents/[id]] [${requestId}] 步骤6: 解析新存储路径`)
      const { folderPath, fileName } = parseFilePath(title.trim())
      const finalTitle = fileName || title.trim()

      console.log(`[PUT /api/documents/[id]] [${requestId}] 路径解析结果:`, {
        originalPath: title,
        folderPath,
        fileName: finalTitle
      })

      // 自动创建文件夹路径（如果路径包含文件夹）
      let finalParentId: string | null = null
      if (folderPath.length > 0) {
        try {
          finalParentId = await ensureFolderPath(db, user.id, folderPath, null)
          console.log(`[PUT /api/documents/[id]] [${requestId}] 文件夹路径创建成功: finalParentId=${finalParentId}`)
        } catch (error: any) {
          console.error(`[PUT /api/documents/[id]] [${requestId}] 创建文件夹路径时出错:`, {
            message: error?.message,
            stack: error?.stack,
            folderPath
          })
          throw createError({
            statusCode: 500,
            message: `Failed to create folder path: ${error?.message || 'Unknown error'}`
          })
        }
      }

      newParentId = finalParentId

      // 检查同一父文件夹下是否已存在同名项
      try {
        const nameConflict = await db.prepare(`
          SELECT id FROM documents 
          WHERE user_id = ? AND parent_id = ? AND title = ? AND id != ?
        `).bind(user.id, newParentId || null, finalTitle, id).first()

        if (nameConflict) {
          console.error(`[PUT /api/documents/[id]] [${requestId}] 名称冲突: title=${finalTitle}`)
          throw createError({
            statusCode: 409,
            message: 'A document or folder with this name already exists in this location'
          })
        }
        console.log(`[PUT /api/documents/[id]] [${requestId}] 名称检查通过`)
      } catch (error: any) {
        if (error.statusCode) {
          throw error
        }
        console.error(`[PUT /api/documents/[id]] [${requestId}] 检查名称冲突时出错:`, {
          message: error?.message,
          stack: error?.stack
        })
        throw createError({
          statusCode: 500,
          message: `Failed to check name conflict: ${error?.message || 'Unknown error'}`
        })
      }
    } else {
      console.log(`[PUT /api/documents/[id]] [${requestId}] 步骤6: 标题未改变，跳过更新`)
    }

    // 7. 如果是文档类型，更新 R2 内容
    if (existing.type === 'document') {
      console.log(`[PUT /api/documents/[id]] [${requestId}] 步骤7: 更新R2存储内容`)
      try {
        const r2 = getR2Bucket(event)
        if (!r2) {
          console.error(`[PUT /api/documents/[id]] [${requestId}] R2存储不可用`)
          throw createError({
            statusCode: 500,
            message: 'R2 storage not available'
          })
        }

        const contentToSave = content !== undefined ? content : ''
        console.log(`[PUT /api/documents/[id]] [${requestId}] 准备更新R2内容: contentLength=${contentToSave.length}`)
        r2Key = await saveDocumentToR2(r2, user.id, id, contentToSave)
        console.log(`[PUT /api/documents/[id]] [${requestId}] R2更新成功: r2Key=${r2Key}`)
      } catch (error: any) {
        if (error.statusCode) {
          throw error
        }
        console.error(`[PUT /api/documents/[id]] [${requestId}] 更新R2时出错:`, {
          message: error?.message,
          stack: error?.stack,
          userId: user.id,
          documentId: id
        })
        throw createError({
          statusCode: 500,
          message: `Failed to update document in storage: ${error?.message || 'Unknown error'}`
        })
      }
    } else {
      console.log(`[PUT /api/documents/[id]] [${requestId}] 步骤7: 跳过R2更新（文件夹类型）`)
    }

    // 8. 更新数据库
    console.log(`[PUT /api/documents/[id]] [${requestId}] 步骤8: 更新数据库`)
    try {
      const finalTitle = title !== undefined ? title.trim() : existing.title
      const result = await db.prepare(`
        UPDATE documents
        SET title = ?, r2_key = ?, parent_id = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
      `).bind(
        finalTitle,
        r2Key,
        newParentId,
        now,
        id,
        user.id
      ).run()

      console.log(`[PUT /api/documents/[id]] [${requestId}] 数据库更新成功:`, {
        documentId: id,
        success: result.success,
        meta: result.meta
      })
    } catch (error: any) {
      console.error(`[PUT /api/documents/[id]] [${requestId}] 更新数据库时出错:`, {
        message: error?.message,
        stack: error?.stack,
        documentId: id,
        userId: user.id
      })
      throw createError({
        statusCode: 500,
        message: `Failed to update document in database: ${error?.message || 'Unknown error'}`
      })
    }

    const duration = Date.now() - startTime
    console.log(`[PUT /api/documents/[id]] [${requestId}] 请求处理成功，耗时: ${duration}ms`)

    // 如果标题更新了，使用解析后的文件名；否则保持原标题
    const finalTitle = title !== undefined
      ? (() => {
          const { fileName } = parseFilePath(title.trim())
          return fileName || title.trim()
        })()
      : existing.title

    return {
      success: true,
      document: {
        id,
        title: finalTitle,
        parent_id: newParentId,
        updated_at: now
      }
    }
  } catch (error: any) {
    const duration = Date.now() - startTime
    console.error(`[PUT /api/documents/[id]] [${requestId}] 请求处理失败，耗时: ${duration}ms`, {
      message: error?.message,
      statusCode: error?.statusCode,
      stack: error?.stack,
      error: error
    })

    // 如果错误已经有 statusCode，直接抛出
    if (error.statusCode) {
      throw error
    }

    // 否则包装为500错误
    throw createError({
      statusCode: 500,
      message: `Internal server error: ${error?.message || 'Unknown error'}`,
      statusMessage: 'Server Error'
    })
  }
})
