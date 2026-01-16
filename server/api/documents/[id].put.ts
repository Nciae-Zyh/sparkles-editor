import { getDBWithMigration } from '../../utils/db'
import { getCurrentUser } from '../../utils/auth'
import { getR2Bucket, saveDocumentToR2 } from '../../utils/r2'
import { parseFilePath, ensureFolderPath } from '../../utils/path'

export default eventHandler(async (event) => {
  const startTime = Date.now()
  const requestId = crypto.randomUUID()

  console.log(`[PUT /api/documents/[id]] [${requestId}] Starting document update request`)

  try {
    // 1. Verify user authentication
    console.log(`[PUT /api/documents/[id]] [${requestId}] Step 1: Verifying user authentication`)
    const user = await getCurrentUser(event)
    if (!user) {
      console.error(`[PUT /api/documents/[id]] [${requestId}] User not authenticated`)
      throw createError({
        statusCode: 401,
        message: 'Unauthorized'
      })
    }
    console.log(`[PUT /api/documents/[id]] [${requestId}] User authenticated successfully: userId=${user.id}`)

    // 2. Get document ID
    const { id } = getRouterParams(event)
    console.log(`[PUT /api/documents/[id]] [${requestId}] Step 2: Getting document ID: id=${id}`)

    // 3. Read request body
    console.log(`[PUT /api/documents/[id]] [${requestId}] Step 3: Reading request body`)
    let body: any
    try {
      body = await readBody(event)
      console.log(`[PUT /api/documents/[id]] [${requestId}] Request body read successfully:`, {
        title: body?.title,
        contentLength: body?.content?.length || 0
      })
    } catch (error: any) {
      console.error(`[PUT /api/documents/[id]] [${requestId}] Failed to read request body:`, {
        message: error?.message,
        stack: error?.stack
      })
      throw createError({
        statusCode: 400,
        message: `Invalid request body: ${error?.message || 'Unknown error'}`
      })
    }

    const { title, content } = body

    // 4. Get database connection and perform migration check
    console.log(`[PUT /api/documents/[id]] [${requestId}] Step 4: Getting database connection`)
    let db: D1Database
    try {
      db = await getDBWithMigration(event)
      console.log(`[PUT /api/documents/[id]] [${requestId}] Database connection successful`)
    } catch (error: any) {
      console.error(`[PUT /api/documents/[id]] [${requestId}] Database not available:`, error?.message)
      throw createError({
        statusCode: 500,
        message: 'Database not available'
      })
    }

    // 5. Check if document exists and belongs to current user
    console.log(`[PUT /api/documents/[id]] [${requestId}] Step 5: Checking if document exists`)
    let existing: any
    try {
      existing = await db.prepare(`
        SELECT id, r2_key, type, path, parent_id, title FROM documents WHERE id = ? AND user_id = ?
      `).bind(id, user.id).first() as any

      if (!existing) {
        console.error(`[PUT /api/documents/[id]] [${requestId}] Document not found or no permission: id=${id}`)
        throw createError({
          statusCode: 404,
          message: 'Document not found'
        })
      }
      console.log(`[PUT /api/documents/[id]] [${requestId}] Document exists: type=${existing.type}, path=${existing.path}`)
    } catch (error: any) {
      if (error.statusCode) {
        throw error
      }
      console.error(`[PUT /api/documents/[id]] [${requestId}] Error checking document:`, {
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

    // 6. If title changed, parse new path and update
    if (title !== undefined && title.trim() !== existing.title) {
      console.log(`[PUT /api/documents/[id]] [${requestId}] Step 6: Parsing new storage path`)
      const { folderPath, fileName } = parseFilePath(title.trim())
      const finalTitle = fileName || title.trim()

      console.log(`[PUT /api/documents/[id]] [${requestId}] Path parsing result:`, {
        originalPath: title,
        folderPath,
        fileName: finalTitle
      })

      // Automatically create folder path (if path contains folders)
      let finalParentId: string | null = null
      let parentPath = '/'
      if (folderPath.length > 0) {
        try {
          finalParentId = await ensureFolderPath(db, user.id, folderPath, null)
          console.log(`[PUT /api/documents/[id]] [${requestId}] Folder path created successfully: finalParentId=${finalParentId}`)

          if (finalParentId) {
            const finalParent = await db.prepare('SELECT path FROM documents WHERE id = ? AND user_id = ?')
              .bind(finalParentId, user.id)
              .first() as any
            if (finalParent) {
              parentPath = finalParent.path
            }
          }
        } catch (error: any) {
          console.error(`[PUT /api/documents/[id]] [${requestId}] Error creating folder path:`, {
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

      newPath = parentPath === '/' ? `/${id}` : `${parentPath}/${id}`
      newParentId = finalParentId

      // Check if new path already exists
      try {
        const pathConflict = await db.prepare('SELECT id FROM documents WHERE path = ? AND user_id = ? AND id != ?')
          .bind(newPath, user.id, id)
          .first()

        if (pathConflict) {
          console.error(`[PUT /api/documents/[id]] [${requestId}] Path conflict: path=${newPath}`)
          throw createError({
            statusCode: 409,
            message: 'A document or folder with this name already exists in this location'
          })
        }
        console.log(`[PUT /api/documents/[id]] [${requestId}] Path check passed: newPath=${newPath}`)
      } catch (error: any) {
        if (error.statusCode) {
          throw error
        }
        console.error(`[PUT /api/documents/[id]] [${requestId}] Error checking path conflict:`, {
          message: error?.message,
          stack: error?.stack
        })
        throw createError({
          statusCode: 500,
          message: `Failed to check path conflict: ${error?.message || 'Unknown error'}`
        })
      }
    } else {
      console.log(`[PUT /api/documents/[id]] [${requestId}] Step 6: Path unchanged, skipping path update`)
    }

    // 7. If document type, update R2 content
    if (existing.type === 'document') {
      console.log(`[PUT /api/documents/[id]] [${requestId}] Step 7: Updating R2 storage content`)
      try {
        const r2 = getR2Bucket(event)
        if (!r2) {
          console.error(`[PUT /api/documents/[id]] [${requestId}] R2 storage not available`)
          throw createError({
            statusCode: 500,
            message: 'R2 storage not available'
          })
        }

        const contentToSave = content !== undefined ? content : ''
        console.log(`[PUT /api/documents/[id]] [${requestId}] Preparing to update R2 content: contentLength=${contentToSave.length}`)
        r2Key = await saveDocumentToR2(r2, user.id, id, contentToSave)
        console.log(`[PUT /api/documents/[id]] [${requestId}] R2 update successful: r2Key=${r2Key}`)
      } catch (error: any) {
        if (error.statusCode) {
          throw error
        }
        console.error(`[PUT /api/documents/[id]] [${requestId}] Error updating R2:`, {
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
      console.log(`[PUT /api/documents/[id]] [${requestId}] Step 7: Skipping R2 update (folder type)`)
    }

    // 8. Update database
    console.log(`[PUT /api/documents/[id]] [${requestId}] Step 8: Updating database`)
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

      console.log(`[PUT /api/documents/[id]] [${requestId}] Database update successful:`, {
        documentId: id,
        success: result.success,
        meta: result.meta
      })
    } catch (error: any) {
      console.error(`[PUT /api/documents/[id]] [${requestId}] Error updating database:`, {
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
    console.log(`[PUT /api/documents/[id]] [${requestId}] Request processed successfully, duration: ${duration}ms`)

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
        path: newPath,
        updated_at: now
      }
    }
  } catch (error: any) {
    const duration = Date.now() - startTime
    console.error(`[PUT /api/documents/[id]] [${requestId}] Request processing failed, duration: ${duration}ms`, {
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
