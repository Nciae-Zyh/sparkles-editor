import { getDBWithMigration } from '../../utils/db'
import { getCurrentUser } from '../../utils/auth'
import { getR2Bucket, saveDocumentToR2 } from '../../utils/r2'

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
        contentLength: body?.content?.length || 0,
        parentId: body?.parentId
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

    const { title, content, parentId } = body

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
        SELECT id, r2_key, type, path, parent_id, title FROM documents WHERE id = ? AND user_id = ?
      `).bind(id, user.id).first() as any

      if (!existing) {
        console.error(`[PUT /api/documents/[id]] [${requestId}] 文档不存在或无权限: id=${id}`)
        throw createError({
          statusCode: 404,
          message: 'Document not found'
        })
      }
      console.log(`[PUT /api/documents/[id]] [${requestId}] 文档存在: type=${existing.type}, path=${existing.path}`)
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
    let newPath = existing.path
    let newParentId = existing.parent_id

    // 6. 如果父目录改变，更新路径
    if (parentId !== undefined && parentId !== existing.parent_id) {
      console.log(`[PUT /api/documents/[id]] [${requestId}] 步骤6: 更新父目录: oldParentId=${existing.parent_id}, newParentId=${parentId}`)
      let parentPath = '/'
      if (parentId) {
        try {
          const parent = await db.prepare('SELECT id, path, type FROM documents WHERE id = ? AND user_id = ?')
            .bind(parentId, user.id)
            .first() as any

          if (!parent || parent.type !== 'folder') {
            console.error(`[PUT /api/documents/[id]] [${requestId}] 无效的父目录: parentId=${parentId}`)
            throw createError({
              statusCode: 400,
              message: 'Invalid parent folder'
            })
          }

          parentPath = parent.path
          console.log(`[PUT /api/documents/[id]] [${requestId}] 父目录验证成功: path=${parentPath}`)
        } catch (error: any) {
          if (error.statusCode) {
            throw error
          }
          console.error(`[PUT /api/documents/[id]] [${requestId}] 验证父目录时出错:`, {
            message: error?.message,
            stack: error?.stack
          })
          throw createError({
            statusCode: 500,
            message: `Failed to validate parent folder: ${error?.message || 'Unknown error'}`
          })
        }
      }

      newPath = parentPath === '/' ? `/${id}` : `${parentPath}/${id}`
      newParentId = parentId || null

      // 检查新路径是否已存在
      try {
        const pathConflict = await db.prepare('SELECT id FROM documents WHERE path = ? AND user_id = ? AND id != ?')
          .bind(newPath, user.id, id)
          .first()

        if (pathConflict) {
          console.error(`[PUT /api/documents/[id]] [${requestId}] 路径冲突: path=${newPath}`)
          throw createError({
            statusCode: 409,
            message: 'A document or folder with this name already exists in this location'
          })
        }
        console.log(`[PUT /api/documents/[id]] [${requestId}] 路径检查通过: newPath=${newPath}`)
      } catch (error: any) {
        if (error.statusCode) {
          throw error
        }
        console.error(`[PUT /api/documents/[id]] [${requestId}] 检查路径冲突时出错:`, {
          message: error?.message,
          stack: error?.stack
        })
        throw createError({
          statusCode: 500,
          message: `Failed to check path conflict: ${error?.message || 'Unknown error'}`
        })
      }
    } else {
      console.log(`[PUT /api/documents/[id]] [${requestId}] 步骤6: 父目录未改变，跳过路径更新`)
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
        SET title = ?, r2_key = ?, parent_id = ?, path = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
      `).bind(
        finalTitle,
        r2Key,
        newParentId,
        newPath,
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

    return {
      success: true,
      document: {
        id,
        title: title !== undefined ? title.trim() : existing.title,
        parent_id: newParentId,
        path: newPath,
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
