import { getDBWithMigration } from '../../utils/db'
import { getCurrentUser, generateDocumentId } from '../../utils/auth'
import { getR2Bucket, saveDocumentToR2 } from '../../utils/r2'
import { parseFilePath, ensureFolderPath } from '../../utils/path'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const { id } = getRouterParams(event)
  if (!id) {
    throw createError({ statusCode: 400, message: 'Document id is required' })
  }

  let body: { title?: string, content?: string }
  try {
    body = await readBody(event)
  } catch (error: any) {
    throw createError({ statusCode: 400, message: `Invalid request body: ${error?.message || 'Unknown error'}` })
  }

  const { title, content } = body

  const db = await getDBWithMigration(event)

  const existing = await db.prepare(`
    SELECT id, r2_key, type, parent_id, title, content_preview, deleted_at FROM documents WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first() as any

  if (!existing || existing.deleted_at) {
    throw createError({ statusCode: 404, message: 'Document not found' })
  }

  const now = Math.floor(Date.now() / 1000)
  let r2Key = existing.r2_key
  let newParentId = existing.parent_id
  let contentPreview = existing.content_preview || ''

  // 如果标题改变，解析新路径并更新
  if (title !== undefined && title.trim() !== existing.title) {
    const { folderPath, fileName } = parseFilePath(title.trim())
    const finalTitle = fileName || title.trim()

    if (folderPath.length > 0) {
      try {
        const resolvedParentId = await ensureFolderPath(db, user.id, folderPath, null)
        newParentId = resolvedParentId
      } catch (error: any) {
        throw createError({ statusCode: 500, message: `Failed to create folder path: ${error?.message || 'Unknown error'}` })
      }
    }

    const nameConflict = await db.prepare(`
      SELECT id FROM documents
      WHERE user_id = ? AND parent_id = ? AND title = ? AND id != ? AND deleted_at IS NULL
    `).bind(user.id, newParentId || null, finalTitle, id).first()

    if (nameConflict) {
      throw createError({ statusCode: 409, message: 'A document or folder with this name already exists in this location' })
    }
  }

  // 只在明确传入 content 时才更新存储（避免仅重命名时清空内容）
  if (content !== undefined && existing.type === 'document') {
    const r2 = getR2Bucket(event)
    try {
      r2Key = await saveDocumentToR2(r2, user.id, id, content)
      contentPreview = String(content || '').slice(0, 2000)
    } catch (error: any) {
      console.error('[PUT /api/documents/[id]] Failed to update storage:', { documentId: id, message: error?.message })
      throw createError({ statusCode: 500, message: `Failed to update document in storage: ${error?.message || 'Unknown error'}` })
    }
  }

  let finalTitle = existing.title
  if (title !== undefined) {
    const { fileName } = parseFilePath(title.trim())
    finalTitle = fileName || title.trim()
  }

  try {
    await db.prepare(`
      UPDATE documents
      SET title = ?, r2_key = ?, parent_id = ?, content_preview = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).bind(finalTitle, r2Key, newParentId, contentPreview, now, id, user.id).run()
  } catch (error: any) {
    console.error('[PUT /api/documents/[id]] Failed to update DB:', { documentId: id, message: error?.message })
    throw createError({ statusCode: 500, message: `Failed to update document in database: ${error?.message || 'Unknown error'}` })
  }

  if (content !== undefined && existing.type === 'document') {
    await db.prepare(`
      INSERT INTO document_versions (id, document_id, user_id, title, content, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(generateDocumentId(), id, user.id, finalTitle, content, now).run().catch(() => {})
  }

  return {
    success: true,
    document: {
      id,
      title: finalTitle,
      parent_id: newParentId,
      updated_at: now
    }
  }
})
