import { getDB } from '../../utils/db'
import { getCurrentUser } from '../../utils/auth'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const db = getDB(event)
  if (!db) {
    throw createError({
      statusCode: 500,
      message: 'Database not available'
    })
  }

  const documents = await db.prepare(`
    SELECT id, title, created_at, updated_at
    FROM documents
    WHERE user_id = ?
    ORDER BY updated_at DESC
  `).bind(user.id).all()

  return {
    documents: documents.results || []
  }
})
