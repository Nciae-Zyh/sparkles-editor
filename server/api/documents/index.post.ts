import { getDBWithMigration } from '../../utils/db'
import { getCurrentUser, generateDocumentId } from '../../utils/auth'
import { getR2Bucket, saveDocumentToR2 } from '../../utils/r2'
import { parseFilePath, ensureFolderPath } from '../../utils/path'

export default eventHandler(async (event) => {
  const startTime = Date.now()
  const requestId = crypto.randomUUID()

  console.log(`[POST /api/documents] [${requestId}] Starting document save request`)

  try {
    // 1. Verify user authentication
    console.log(`[POST /api/documents] [${requestId}] Step 1: Verifying user authentication`)
    const user = await getCurrentUser(event)
    if (!user) {
      console.error(`[POST /api/documents] [${requestId}] User not authenticated`)
      throw createError({
        statusCode: 401,
        message: 'Unauthorized'
      })
    }
    console.log(`[POST /api/documents] [${requestId}] User authenticated successfully: userId=${user.id}, email=${user.email}`)

    // 2. Read request body
    console.log(`[POST /api/documents] [${requestId}] Step 2: Reading request body`)
    let body: any
    try {
      body = await readBody(event)
      console.log(`[POST /api/documents] [${requestId}] Request body read successfully:`, {
        title: body?.title,
        contentLength: body?.content?.length || 0,
        type: body?.type
      })
    } catch (error: any) {
      console.error(`[POST /api/documents] [${requestId}] Failed to read request body:`, {
        message: error?.message,
        stack: error?.stack
      })
      throw createError({
        statusCode: 400,
        message: `Invalid request body: ${error?.message || 'Unknown error'}`
      })
    }

    const { title, content, type = 'document', id: clientDocumentId } = body

    // 3. Parse file path (similar to WebStorm, supports folder/subfolder/file.md format)
    console.log(`[POST /api/documents] [${requestId}] Step 3: Parsing storage path`)
    const { folderPath, fileName } = parseFilePath(title.trim())
    const finalTitle = fileName || title.trim()
    console.log(`[POST /api/documents] [${requestId}] Path parsing result:`, {
      originalPath: title,
      folderPath,
      fileName: finalTitle
    })

    // 4. Validate required fields
    console.log(`[POST /api/documents] [${requestId}] Step 4: Validating required fields`)
    if (!finalTitle || !finalTitle.trim()) {
      console.error(`[POST /api/documents] [${requestId}] Title validation failed: finalTitle=${finalTitle}`)
      throw createError({
        statusCode: 400,
        message: 'Title is required'
      })
    }
    console.log(`[POST /api/documents] [${requestId}] Field validation passed`)

    // 5. Get database connection and perform migration check
    console.log(`[POST /api/documents] [${requestId}] Step 5: Getting database connection`)
    let db: D1Database
    try {
      db = await getDBWithMigration(event)
      console.log(`[POST /api/documents] [${requestId}] Database connection successful`)
    } catch (error: any) {
      console.error(`[POST /api/documents] [${requestId}] Database not available:`, error?.message)
      throw createError({
        statusCode: 500,
        message: 'Database not available'
      })
    }

    // 6. Automatically create folder path (if path contains folders)
    let finalParentId: string | null = null
    let parentPath = '/'
    if (folderPath.length > 0) {
      console.log(`[POST /api/documents] [${requestId}] Step 6: Automatically creating folder path:`, folderPath)
      try {
        finalParentId = await ensureFolderPath(db, user.id, folderPath, null)
        console.log(`[POST /api/documents] [${requestId}] Folder path created successfully: finalParentId=${finalParentId}`)

        // 更新 parentPath 用于后续路径计算
        if (finalParentId) {
          const finalParent = await db.prepare('SELECT path FROM documents WHERE id = ? AND user_id = ?')
            .bind(finalParentId, user.id)
            .first() as any
          if (finalParent) {
            parentPath = finalParent.path
          }
        }
      } catch (error: any) {
        console.error(`[POST /api/documents] [${requestId}] Error creating folder path:`, {
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
      console.log(`[POST /api/documents] [${requestId}] Step 6: No folder path needed, saving to root directory`)
    }

    // 6. Generate or use client-provided document ID and path
    console.log(`[POST /api/documents] [${requestId}] Step 6: Generating or using document ID and path`)
    let documentId: string

    // If client provided an ID, verify if it already exists
    if (clientDocumentId) {
      console.log(`[POST /api/documents] [${requestId}] Client provided document ID: ${clientDocumentId}`)
      // 检查该ID是否已存在且属于当前用户
      const existing = await db.prepare('SELECT id FROM documents WHERE id = ? AND user_id = ?')
        .bind(clientDocumentId, user.id)
        .first()

      if (existing) {
        console.log(`[POST /api/documents] [${requestId}] Document ID already exists, should use PUT to update instead`)
        // If it exists, should use PUT to update, but for compatibility, we generate a new ID
        // Or throw an error to prompt using PUT
        throw createError({
          statusCode: 409,
          message: 'Document with this ID already exists. Use PUT to update instead.'
        })
      }

      // Validate ID format (32-character hexadecimal string)
      if (!/^[0-9a-f]{32}$/.test(clientDocumentId)) {
        console.error(`[POST /api/documents] [${requestId}] Invalid client-provided ID format: ${clientDocumentId}`)
        throw createError({
          statusCode: 400,
          message: 'Invalid document ID format'
        })
      }

      documentId = clientDocumentId
      console.log(`[POST /api/documents] [${requestId}] Using client-provided document ID: ${documentId}`)
    } else {
      documentId = generateDocumentId()
      console.log(`[POST /api/documents] [${requestId}] Generated new document ID: ${documentId}`)
    }

    const now = Math.floor(Date.now() / 1000)
    const path = parentPath === '/' ? `/${documentId}` : `${parentPath}/${documentId}`
    console.log(`[POST /api/documents] [${requestId}] Document ID determined: documentId=${documentId}, path=${path}`)

    // 8. Check if path already exists
    console.log(`[POST /api/documents] [${requestId}] Step 8: Checking path conflicts`)
    try {
      const existing = await db.prepare('SELECT id FROM documents WHERE path = ? AND user_id = ?')
        .bind(path, user.id)
        .first()

      if (existing) {
        console.error(`[POST /api/documents] [${requestId}] Path already exists: path=${path}`)
        throw createError({
          statusCode: 409,
          message: 'A document or folder with this name already exists in this location'
        })
      }
      console.log(`[POST /api/documents] [${requestId}] Path check passed`)
    } catch (error: any) {
      if (error.statusCode) {
        throw error
      }
      console.error(`[POST /api/documents] [${requestId}] Error checking path:`, {
        message: error?.message,
        stack: error?.stack
      })
      throw createError({
        statusCode: 500,
        message: `Failed to check path conflict: ${error?.message || 'Unknown error'}`
      })
    }

    // 9. Save to R2 (if document type)
    let r2Key = ''
    if (type === 'document') {
      console.log(`[POST /api/documents] [${requestId}] Step 9: Saving to R2 storage`)
      try {
        const r2 = getR2Bucket(event)
        if (!r2) {
          console.error(`[POST /api/documents] [${requestId}] R2 storage not available`)
          throw createError({
            statusCode: 500,
            message: 'R2 storage not available'
          })
        }

        const contentToSave = content || ''
        console.log(`[POST /api/documents] [${requestId}] Preparing to save content to R2: contentLength=${contentToSave.length}`)
        r2Key = await saveDocumentToR2(r2, user.id, documentId, contentToSave)
        console.log(`[POST /api/documents] [${requestId}] R2 save successful: r2Key=${r2Key}`)
      } catch (error: any) {
        if (error.statusCode) {
          throw error
        }
        console.error(`[POST /api/documents] [${requestId}] Error saving to R2:`, {
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
      console.log(`[POST /api/documents] [${requestId}] Step 8: Skipping R2 storage (folder type)`)
      r2Key = ''
    }

    // 10. Save to database
    console.log(`[POST /api/documents] [${requestId}] Step 10: Saving to database`)
    try {
      const result = await db.prepare(`
        INSERT INTO documents (id, user_id, title, r2_key, parent_id, path, type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        documentId,
        user.id,
        finalTitle,
        r2Key,
        finalParentId,
        path,
        type,
        now,
        now
      ).run()

      console.log(`[POST /api/documents] [${requestId}] Database save successful:`, {
        documentId,
        success: result.success,
        meta: result.meta
      })
    } catch (error: any) {
      console.error(`[POST /api/documents] [${requestId}] Error saving to database:`, {
        message: error?.message,
        stack: error?.stack,
        documentId,
        userId: user.id
      })

      // If R2 was saved but database save failed, try to clean up R2
      if (r2Key && type === 'document') {
        try {
          console.log(`[POST /api/documents] [${requestId}] Attempting to clean up R2 file: r2Key=${r2Key}`)
          const r2 = getR2Bucket(event)
          if (r2) {
            await r2.delete(r2Key)
            console.log(`[POST /api/documents] [${requestId}] R2 cleanup successful`)
          }
        } catch (cleanupError: any) {
          console.error(`[POST /api/documents] [${requestId}] R2 cleanup failed:`, cleanupError?.message)
        }
      }

      throw createError({
        statusCode: 500,
        message: `Failed to save document to database: ${error?.message || 'Unknown error'}`
      })
    }

    const duration = Date.now() - startTime
    console.log(`[POST /api/documents] [${requestId}] Request processed successfully, duration: ${duration}ms`)

    return {
      success: true,
      document: {
        id: documentId,
        title: finalTitle,
        parent_id: finalParentId,
        path,
        type,
        created_at: now,
        updated_at: now
      }
    }
  } catch (error: any) {
    const duration = Date.now() - startTime
    console.error(`[POST /api/documents] [${requestId}] Request processing failed, duration: ${duration}ms`, {
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
