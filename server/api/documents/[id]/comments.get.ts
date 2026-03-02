import { getDBWithMigration } from '../../../utils/db'
import { getCurrentUser } from '../../../utils/auth'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const { id } = getRouterParams(event)
  const db = await getDBWithMigration(event)

  const doc = await db.prepare(`
    SELECT id, deleted_at
    FROM documents
    WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first() as any

  if (!doc || doc.deleted_at) {
    throw createError({ statusCode: 404, message: 'Document not found' })
  }

  const comments = await db.prepare(`
    SELECT c.id, c.selected_text, c.comment, c.status, c.created_at, c.updated_at, c.user_id, u.name, u.email
    FROM document_comments c
    LEFT JOIN users u ON c.user_id = u.id
    WHERE c.document_id = ?
    ORDER BY c.created_at DESC
  `).bind(id).all()

  const commentIds = (comments.results || []).map((item: any) => item.id)
  let replies: any[] = []
  if (commentIds.length > 0) {
    const placeholders = commentIds.map(() => '?').join(',')
    const rows = await db.prepare(`
      SELECT r.id, r.comment_id, r.content, r.created_at, r.updated_at, r.user_id, u.name, u.email
      FROM document_comment_replies r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.comment_id IN (${placeholders})
      ORDER BY r.created_at ASC
    `).bind(...commentIds).all()
    replies = rows.results || []
  }

  const repliesByComment = new Map<string, any[]>()
  for (const reply of replies) {
    if (!repliesByComment.has(reply.comment_id)) {
      repliesByComment.set(reply.comment_id, [])
    }
    repliesByComment.get(reply.comment_id)?.push(reply)
  }

  return {
    comments: (comments.results || []).map((comment: any) => ({
      ...comment,
      replies: repliesByComment.get(comment.id) || []
    }))
  }
})
