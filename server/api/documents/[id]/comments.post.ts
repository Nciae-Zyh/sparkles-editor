import { getDBWithMigration } from '../../../utils/db'
import { generateDocumentId, getCurrentUser } from '../../../utils/auth'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const { id } = getRouterParams(event)
  const body = await readBody(event)
  const comment = String(body?.comment || '').trim()
  const selectedText = String(body?.selectedText || '').trim()

  if (!comment) {
    throw createError({ statusCode: 400, message: 'Comment is required' })
  }

  const db = await getDBWithMigration(event)
  const doc = await db.prepare(`
    SELECT id, deleted_at
    FROM documents
    WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first() as any

  if (!doc || doc.deleted_at) {
    throw createError({ statusCode: 404, message: 'Document not found' })
  }

  const commentId = generateDocumentId()
  const now = Math.floor(Date.now() / 1000)
  await db.prepare(`
    INSERT INTO document_comments (id, document_id, user_id, selected_text, comment, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'open', ?, ?)
  `).bind(commentId, id, user.id, selectedText.slice(0, 500), comment, now, now).run()

  return {
    success: true,
    comment: {
      id: commentId,
      document_id: id,
      user_id: user.id,
      selected_text: selectedText.slice(0, 500),
      comment,
      status: 'open',
      created_at: now,
      updated_at: now
    }
  }
})
