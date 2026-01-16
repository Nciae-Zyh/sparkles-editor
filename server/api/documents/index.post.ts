import { getDBWithMigration } from '../../utils/db'
import { getCurrentUser, generateDocumentId } from '../../utils/auth'
import { getR2Bucket, saveDocumentToR2 } from '../../utils/r2'
import { parseFilePath, ensureFolderPath } from '../../utils/path'

export default eventHandler(async (event) => {
  const startTime = Date.now()
  const requestId = crypto.randomUUID()

  console.log(`[POST /api/documents] [${requestId}] 开始处理保存文档请求`)

  try {
    // 1. 验证用户身份
    console.log(`[POST /api/documents] [${requestId}] 步骤1: 验证用户身份`)
    const user = await getCurrentUser(event)
    if (!user) {
      console.error(`[POST /api/documents] [${requestId}] 用户未认证`)
      throw createError({
        statusCode: 401,
        message: 'Unauthorized'
      })
    }
    console.log(`[POST /api/documents] [${requestId}] 用户认证成功: userId=${user.id}, email=${user.email}`)

    // 2. 读取请求体
    console.log(`[POST /api/documents] [${requestId}] 步骤2: 读取请求体`)
    let body: any
    try {
      body = await readBody(event)
      console.log(`[POST /api/documents] [${requestId}] 请求体读取成功:`, {
        title: body?.title,
        contentLength: body?.content?.length || 0,
        type: body?.type
      })
    } catch (error: any) {
      console.error(`[POST /api/documents] [${requestId}] 读取请求体失败:`, {
        message: error?.message,
        stack: error?.stack
      })
      throw createError({
        statusCode: 400,
        message: `Invalid request body: ${error?.message || 'Unknown error'}`
      })
    }

    const { title, content, type = 'document', id: clientDocumentId, parentId: clientParentId } = body

    // 3. 解析文件名（类似 WebStorm，支持 folder/subfolder/file.md 格式）
    console.log(`[POST /api/documents] [${requestId}] 步骤3: 解析存储路径`)
    const { folderPath, fileName } = parseFilePath(title.trim())
    const finalTitle = fileName || title.trim()
    console.log(`[POST /api/documents] [${requestId}] 路径解析结果:`, {
      originalPath: title,
      folderPath,
      fileName: finalTitle
    })

    // 4. 验证必填字段
    console.log(`[POST /api/documents] [${requestId}] 步骤4: 验证必填字段`)
    if (!finalTitle || !finalTitle.trim()) {
      console.error(`[POST /api/documents] [${requestId}] 标题验证失败: finalTitle=${finalTitle}`)
      throw createError({
        statusCode: 400,
        message: 'Title is required'
      })
    }
    console.log(`[POST /api/documents] [${requestId}] 字段验证通过`)

    // 5. 获取数据库连接并执行迁移检查
    console.log(`[POST /api/documents] [${requestId}] 步骤5: 获取数据库连接`)
    let db: D1Database
    try {
      db = await getDBWithMigration(event)
      console.log(`[POST /api/documents] [${requestId}] 数据库连接成功`)
    } catch (error: any) {
      console.error(`[POST /api/documents] [${requestId}] 数据库不可用:`, error?.message)
      throw createError({
        statusCode: 500,
        message: 'Database not available'
      })
    }

    // 6. 确定父文件夹ID
    let finalParentId: string | null = null

    // 如果客户端提供了 parentId，优先使用它
    if (clientParentId) {
      console.log(`[POST /api/documents] [${requestId}] 使用客户端提供的 parentId: ${clientParentId}`)
      // 验证父文件夹是否存在且属于当前用户
      const parent = await db.prepare('SELECT id, type FROM documents WHERE id = ? AND user_id = ?')
        .bind(clientParentId, user.id)
        .first() as any

      if (!parent) {
        throw createError({
          statusCode: 404,
          message: 'Parent folder not found'
        })
      }

      if (parent.type !== 'folder') {
        throw createError({
          statusCode: 400,
          message: 'Parent must be a folder'
        })
      }

      finalParentId = clientParentId
    } else if (folderPath.length > 0) {
      // 如果没有提供 parentId，但路径包含文件夹，则自动创建文件夹路径
      console.log(`[POST /api/documents] [${requestId}] 步骤6: 自动创建文件夹路径:`, folderPath)
      try {
        finalParentId = await ensureFolderPath(db, user.id, folderPath, null)
        console.log(`[POST /api/documents] [${requestId}] 文件夹路径创建成功: finalParentId=${finalParentId}`)
      } catch (error: any) {
        console.error(`[POST /api/documents] [${requestId}] 创建文件夹路径时出错:`, {
          message: error?.message,
          stack: error?.stack,
          folderPath
        })
        throw createError({
          statusCode: 500,
          message: `Failed to create folder path: ${error?.message || 'Unknown error'}`
        })
      }
    } else {
      console.log(`[POST /api/documents] [${requestId}] 步骤6: 无需创建文件夹路径，保存到根目录`)
    }

    // 6. 生成或使用客户端提供的文档ID和路径
    console.log(`[POST /api/documents] [${requestId}] 步骤6: 生成或使用文档ID和路径`)
    let documentId: string

    // 如果客户端提供了ID，验证它是否已存在
    if (clientDocumentId) {
      console.log(`[POST /api/documents] [${requestId}] 客户端提供了文档ID: ${clientDocumentId}`)
      // 检查该ID是否已存在且属于当前用户
      const existing = await db.prepare('SELECT id FROM documents WHERE id = ? AND user_id = ?')
        .bind(clientDocumentId, user.id)
        .first()

      if (existing) {
        console.log(`[POST /api/documents] [${requestId}] 文档ID已存在，将使用PUT更新而不是创建`)
        // 如果已存在，应该使用PUT更新，但这里为了兼容性，我们生成新ID
        // 或者可以抛出错误提示使用PUT
        throw createError({
          statusCode: 409,
          message: 'Document with this ID already exists. Use PUT to update instead.'
        })
      }

      // 验证ID格式（32位十六进制字符串）
      if (!/^[0-9a-f]{32}$/.test(clientDocumentId)) {
        console.error(`[POST /api/documents] [${requestId}] 客户端提供的ID格式无效: ${clientDocumentId}`)
        throw createError({
          statusCode: 400,
          message: 'Invalid document ID format'
        })
      }

      documentId = clientDocumentId
      console.log(`[POST /api/documents] [${requestId}] 使用客户端提供的文档ID: ${documentId}`)
    } else {
      documentId = generateDocumentId()
      console.log(`[POST /api/documents] [${requestId}] 生成新的文档ID: ${documentId}`)
    }

    const now = Math.floor(Date.now() / 1000)
    console.log(`[POST /api/documents] [${requestId}] 文档ID确定: documentId=${documentId}`)

    // 8. 检查同一父文件夹下是否已存在同名项
    console.log(`[POST /api/documents] [${requestId}] 步骤8: 检查名称冲突`)
    try {
      const existing = await db.prepare(`
        SELECT id FROM documents 
        WHERE user_id = ? AND parent_id = ? AND title = ? AND type = ?
      `).bind(user.id, finalParentId || null, finalTitle, type).first()

      if (existing) {
        console.error(`[POST /api/documents] [${requestId}] 同名项已存在: title=${finalTitle}`)
        throw createError({
          statusCode: 409,
          message: 'A document or folder with this name already exists in this location'
        })
      }
      console.log(`[POST /api/documents] [${requestId}] 名称检查通过`)
    } catch (error: any) {
      if (error.statusCode) {
        throw error
      }
      console.error(`[POST /api/documents] [${requestId}] 检查名称冲突时出错:`, {
        message: error?.message,
        stack: error?.stack
      })
      throw createError({
        statusCode: 500,
        message: `Failed to check name conflict: ${error?.message || 'Unknown error'}`
      })
    }

    // 9. 保存到 R2（如果是文档）
    let r2Key = ''
    if (type === 'document') {
      console.log(`[POST /api/documents] [${requestId}] 步骤9: 保存到R2存储`)
      try {
        const r2 = getR2Bucket(event)
        if (!r2) {
          console.error(`[POST /api/documents] [${requestId}] R2存储不可用`)
          throw createError({
            statusCode: 500,
            message: 'R2 storage not available'
          })
        }

        const contentToSave = content || ''
        console.log(`[POST /api/documents] [${requestId}] 准备保存内容到R2: contentLength=${contentToSave.length}`)
        r2Key = await saveDocumentToR2(r2, user.id, documentId, contentToSave)
        console.log(`[POST /api/documents] [${requestId}] R2保存成功: r2Key=${r2Key}`)
      } catch (error: any) {
        if (error.statusCode) {
          throw error
        }
        console.error(`[POST /api/documents] [${requestId}] 保存到R2时出错:`, {
          message: error?.message,
          stack: error?.stack,
          userId: user.id,
          documentId
        })
        throw createError({
          statusCode: 500,
          message: `Failed to save document to storage: ${error?.message || 'Unknown error'}`
        })
      }
    } else {
      console.log(`[POST /api/documents] [${requestId}] 步骤8: 跳过R2存储（文件夹类型）`)
      r2Key = ''
    }

    // 10. 保存到数据库
    console.log(`[POST /api/documents] [${requestId}] 步骤10: 保存到数据库`)
    try {
      const result = await db.prepare(`
        INSERT INTO documents (id, user_id, title, r2_key, parent_id, type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        documentId,
        user.id,
        finalTitle,
        r2Key,
        finalParentId,
        type,
        now,
        now
      ).run()

      console.log(`[POST /api/documents] [${requestId}] 数据库保存成功:`, {
        documentId,
        success: result.success,
        meta: result.meta
      })
    } catch (error: any) {
      console.error(`[POST /api/documents] [${requestId}] 保存到数据库时出错:`, {
        message: error?.message,
        stack: error?.stack,
        documentId,
        userId: user.id
      })

      // 如果R2已保存但数据库保存失败，尝试清理R2
      if (r2Key && type === 'document') {
        try {
          console.log(`[POST /api/documents] [${requestId}] 尝试清理R2中的文件: r2Key=${r2Key}`)
          const r2 = getR2Bucket(event)
          if (r2) {
            await r2.delete(r2Key)
            console.log(`[POST /api/documents] [${requestId}] R2清理成功`)
          }
        } catch (cleanupError: any) {
          console.error(`[POST /api/documents] [${requestId}] R2清理失败:`, cleanupError?.message)
        }
      }

      throw createError({
        statusCode: 500,
        message: `Failed to save document to database: ${error?.message || 'Unknown error'}`
      })
    }

    const duration = Date.now() - startTime
    console.log(`[POST /api/documents] [${requestId}] 请求处理成功，耗时: ${duration}ms`)

    return {
      success: true,
      document: {
        id: documentId,
        title: finalTitle,
        parent_id: finalParentId,
        type,
        created_at: now,
        updated_at: now
      }
    }
  } catch (error: any) {
    const duration = Date.now() - startTime
    console.error(`[POST /api/documents] [${requestId}] 请求处理失败，耗时: ${duration}ms`, {
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
