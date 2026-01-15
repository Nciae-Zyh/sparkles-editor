import { getDB } from '../../utils/db'
import { getCurrentUser, generateDocumentId } from '../../utils/auth'
import { getR2Bucket, saveDocumentToR2 } from '../../utils/r2'

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
        parentId: body?.parentId,
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

    const { title, content, parentId, type = 'document' } = body

    // 3. 验证必填字段
    console.log(`[POST /api/documents] [${requestId}] 步骤3: 验证必填字段`)
    if (!title || typeof title !== 'string' || !title.trim()) {
      console.error(`[POST /api/documents] [${requestId}] 标题验证失败: title=${title}`)
      throw createError({
        statusCode: 400,
        message: 'Title is required'
      })
    }
    console.log(`[POST /api/documents] [${requestId}] 字段验证通过`)

    // 4. 获取数据库连接
    console.log(`[POST /api/documents] [${requestId}] 步骤4: 获取数据库连接`)
    const db = getDB(event)
    if (!db) {
      console.error(`[POST /api/documents] [${requestId}] 数据库不可用`)
      throw createError({
        statusCode: 500,
        message: 'Database not available'
      })
    }
    console.log(`[POST /api/documents] [${requestId}] 数据库连接成功`)

    // 5. 验证父目录（如果提供）
    let parentPath = '/'
    if (parentId) {
      console.log(`[POST /api/documents] [${requestId}] 步骤5: 验证父目录 parentId=${parentId}`)
      try {
        const parent = await db.prepare('SELECT id, path, type FROM documents WHERE id = ? AND user_id = ?')
          .bind(parentId, user.id)
          .first() as any

        if (!parent) {
          console.error(`[POST /api/documents] [${requestId}] 父目录不存在: parentId=${parentId}`)
          throw createError({
            statusCode: 404,
            message: 'Parent folder not found'
          })
        }

        if (parent.type !== 'folder') {
          console.error(`[POST /api/documents] [${requestId}] 父目录类型错误: type=${parent.type}`)
          throw createError({
            statusCode: 400,
            message: 'Parent must be a folder'
          })
        }

        parentPath = parent.path
        console.log(`[POST /api/documents] [${requestId}] 父目录验证成功: path=${parentPath}`)
      } catch (error: any) {
        if (error.statusCode) {
          throw error
        }
        console.error(`[POST /api/documents] [${requestId}] 验证父目录时出错:`, {
          message: error?.message,
          stack: error?.stack
        })
        throw createError({
          statusCode: 500,
          message: `Failed to validate parent folder: ${error?.message || 'Unknown error'}`
        })
      }
    } else {
      console.log(`[POST /api/documents] [${requestId}] 步骤5: 无父目录，使用根目录`)
    }

    // 6. 生成文档ID和路径
    console.log(`[POST /api/documents] [${requestId}] 步骤6: 生成文档ID和路径`)
    const documentId = generateDocumentId()
    const now = Math.floor(Date.now() / 1000)
    const path = parentPath === '/' ? `/${documentId}` : `${parentPath}/${documentId}`
    console.log(`[POST /api/documents] [${requestId}] 文档ID生成成功: documentId=${documentId}, path=${path}`)

    // 7. 检查路径是否已存在
    console.log(`[POST /api/documents] [${requestId}] 步骤7: 检查路径冲突`)
    try {
      const existing = await db.prepare('SELECT id FROM documents WHERE path = ? AND user_id = ?')
        .bind(path, user.id)
        .first()

      if (existing) {
        console.error(`[POST /api/documents] [${requestId}] 路径已存在: path=${path}`)
        throw createError({
          statusCode: 409,
          message: 'A document or folder with this name already exists in this location'
        })
      }
      console.log(`[POST /api/documents] [${requestId}] 路径检查通过`)
    } catch (error: any) {
      if (error.statusCode) {
        throw error
      }
      console.error(`[POST /api/documents] [${requestId}] 检查路径时出错:`, {
        message: error?.message,
        stack: error?.stack
      })
      throw createError({
        statusCode: 500,
        message: `Failed to check path conflict: ${error?.message || 'Unknown error'}`
      })
    }

    // 8. 保存到 R2（如果是文档）
    let r2Key = ''
    if (type === 'document') {
      console.log(`[POST /api/documents] [${requestId}] 步骤8: 保存到R2存储`)
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

    // 9. 保存到数据库
    console.log(`[POST /api/documents] [${requestId}] 步骤9: 保存到数据库`)
    try {
      const result = await db.prepare(`
        INSERT INTO documents (id, user_id, title, r2_key, parent_id, path, type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        documentId,
        user.id,
        title.trim(),
        r2Key,
        parentId || null,
        path,
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
        title: title.trim(),
        parent_id: parentId || null,
        path,
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
