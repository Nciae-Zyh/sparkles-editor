import { getDBWithMigration } from '../../utils/db'
import { getCurrentUser } from '../../utils/auth'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const db = await getDBWithMigration(event)
  const recent = await db.prepare(`
    SELECT id, title, type, updated_at, is_favorite, is_pinned, tags
    FROM documents
    WHERE user_id = ? AND deleted_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 12
  `).bind(user.id).all()

  return {
    items: recent.results || []
  }
})
