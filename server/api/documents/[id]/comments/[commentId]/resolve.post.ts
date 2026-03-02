import { getDBWithMigration } from '../../../../../utils/db'
import { getCurrentUser } from '../../../../../utils/auth'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const { id, commentId } = getRouterParams(event)
  const body = await readBody(event).catch(() => ({}))
  const resolved = body?.resolved !== false
  const status = resolved ? 'resolved' : 'open'

  const db = await getDBWithMigration(event)
  const comment = await db.prepare(`
    SELECT id
    FROM document_comments
    WHERE id = ? AND document_id = ?
  `).bind(commentId, id).first()

  if (!comment) {
    throw createError({ statusCode: 404, message: 'Comment not found' })
  }

  const now = Math.floor(Date.now() / 1000)
  await db.prepare(`
    UPDATE document_comments
    SET status = ?, updated_at = ?
    WHERE id = ?
  `).bind(status, now, commentId).run()

  return { success: true, id: commentId, status }
})
