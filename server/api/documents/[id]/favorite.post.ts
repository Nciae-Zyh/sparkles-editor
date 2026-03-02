import { getDBWithMigration } from '../../../utils/db'
import { getCurrentUser } from '../../../utils/auth'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const { id } = getRouterParams(event)
  const body = await readBody(event).catch(() => ({}))
  const explicit = body?.isFavorite

  const db = await getDBWithMigration(event)
  const item = await db.prepare(`
    SELECT id, is_favorite, deleted_at
    FROM documents
    WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first() as any

  if (!item || item.deleted_at) {
    throw createError({ statusCode: 404, message: 'Document not found' })
  }

  const nextValue = typeof explicit === 'boolean' ? (explicit ? 1 : 0) : (item.is_favorite ? 0 : 1)
  const now = Math.floor(Date.now() / 1000)
  await db.prepare(`
    UPDATE documents
    SET is_favorite = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).bind(nextValue, now, id, user.id).run()

  return { success: true, id, is_favorite: nextValue }
})
