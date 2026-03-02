import { getDBWithMigration } from '../../utils/db'
import { getCurrentUser } from '../../utils/auth'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const db = await getDBWithMigration(event)

  const trashed = await db.prepare(`
    SELECT id, title, type, parent_id, deleted_at, updated_at
    FROM documents
    WHERE user_id = ? AND deleted_at IS NOT NULL
    ORDER BY deleted_at DESC
  `).bind(user.id).all()

  return {
    items: trashed.results || []
  }
})
