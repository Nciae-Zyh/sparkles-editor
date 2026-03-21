import { getDBWithMigration } from '../../../../../utils/db'
import { getCurrentUser } from '../../../../../utils/auth'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const { id, commentId } = getRouterParams(event)
  const db = await getDBWithMigration(event)

  const comment = await db.prepare(`
    SELECT id, user_id
    FROM document_comments
    WHERE id = ? AND document_id = ?
  `).bind(commentId, id).first() as any

  if (!comment) {
    throw createError({ statusCode: 404, message: 'Comment not found' })
  }

  // Only the comment author can delete
  if (comment.user_id !== user.id) {
    throw createError({ statusCode: 403, message: 'Not authorized to delete this comment' })
  }

  // Delete replies first
  await db.prepare(`
    DELETE FROM document_comment_replies WHERE comment_id = ?
  `).bind(commentId).run()

  // Delete the comment
  await db.prepare(`
    DELETE FROM document_comments WHERE id = ?
  `).bind(commentId).run()

  return { success: true, id: commentId }
})
