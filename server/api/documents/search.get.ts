import { getDBWithMigration } from '../../utils/db'
import { getCurrentUser } from '../../utils/auth'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const query = getQuery(event)
  const q = String(query.q || '').trim()
  const tag = String(query.tag || '').trim()

  if (!q && !tag) {
    return { items: [] }
  }

  const db = await getDBWithMigration(event)
  const like = `%${q}%`
  const tagLike = `%\"${tag}\"%`
  const items = await db.prepare(`
    SELECT id, title, type, parent_id, tags, is_favorite, is_pinned, content_preview, updated_at
    FROM documents
    WHERE user_id = ?
      AND deleted_at IS NULL
      AND (? = '' OR title LIKE ? OR content_preview LIKE ?)
      AND (? = '' OR tags LIKE ?)
    ORDER BY is_pinned DESC, is_favorite DESC, updated_at DESC
    LIMIT 60
  `).bind(user.id, q, like, like, tag, tagLike).all()

  return { items: items.results || [] }
})
