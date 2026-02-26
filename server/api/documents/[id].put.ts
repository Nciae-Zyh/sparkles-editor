import { getDBWithMigration } from '../../utils/db'
import { getCurrentUser } from '../../utils/auth'
import { getR2Bucket, saveDocumentToR2 } from '../../utils/r2'
import { parseFilePath, ensureFolderPath } from '../../utils/path'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const { id } = getRouterParams(event)

  let body: { title?: string, content?: string }
  try {
    body = await readBody(event)
  } catch (error: any) {
    throw createError({ statusCode: 400, message: `Invalid request body: ${error?.message || 'Unknown error'}` })
  }

  const { title, content } = body

  const db = await getDBWithMigration(event)

  const existing = await db.prepare(`
    SELECT id, r2_key, type, parent_id, title FROM documents WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first() as any

  if (!existing) {
    throw createError({ statusCode: 404, message: 'Document not found' })
  }

  const now = Math.floor(Date.now() / 1000)
  let r2Key = existing.r2_key
  let newParentId = existing.parent_id

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
      WHERE user_id = ? AND parent_id = ? AND title = ? AND id != ?
    `).bind(user.id, newParentId || null, finalTitle, id).first()

    if (nameConflict) {
      throw createError({ statusCode: 409, message: 'A document or folder with this name already exists in this location' })
    }
  }

  // 只在明确传入 content 时才更新 R2（避免仅重命名时清空内容）
  if (content !== undefined && existing.type === 'document') {
    const r2 = getR2Bucket(event)
    if (!r2) {
      throw createError({ statusCode: 500, message: 'R2 storage not available' })
    }
    try {
      r2Key = await saveDocumentToR2(r2, user.id, id, content)
    } catch (error: any) {
      console.error('[PUT /api/documents/[id]] Failed to update R2:', { documentId: id, message: error?.message })
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
      SET title = ?, r2_key = ?, parent_id = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).bind(finalTitle, r2Key, newParentId, now, id, user.id).run()
  } catch (error: any) {
    console.error('[PUT /api/documents/[id]] Failed to update DB:', { documentId: id, message: error?.message })
    throw createError({ statusCode: 500, message: `Failed to update document in database: ${error?.message || 'Unknown error'}` })
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
