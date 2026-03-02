import { getDBWithMigration } from '../../../../../utils/db'
import { generateDocumentId, getCurrentUser } from '../../../../../utils/auth'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const { id, commentId } = getRouterParams(event)
  const body = await readBody(event)
  const content = String(body?.content || '').trim()
  if (!content) {
    throw createError({ statusCode: 400, message: 'Reply content is required' })
  }

  const db = await getDBWithMigration(event)
  const comment = await db.prepare(`
    SELECT id
    FROM document_comments
    WHERE id = ? AND document_id = ?
  `).bind(commentId, id).first()

  if (!comment) {
    throw createError({ statusCode: 404, message: 'Comment not found' })
  }

  const replyId = generateDocumentId()
  const now = Math.floor(Date.now() / 1000)
  await db.prepare(`
    INSERT INTO document_comment_replies (id, comment_id, user_id, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(replyId, commentId, user.id, content, now, now).run()

  return {
    success: true,
    reply: {
      id: replyId,
      comment_id: commentId,
      user_id: user.id,
      content,
      created_at: now,
      updated_at: now
    }
  }
})
