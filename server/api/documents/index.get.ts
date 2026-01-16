import { getDBWithMigration } from '../../utils/db'
import { getCurrentUser } from '../../utils/auth'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const query = getQuery(event)
  const parentId = query.parentId as string | undefined

  const db = await getDBWithMigration(event)

  // 如果指定了 parentId，返回该目录下的内容
  // 否则返回根目录（parent_id IS NULL）的内容
  let documents
  if (parentId) {
    documents = await db.prepare(`
      SELECT id, title, type, parent_id, created_at, updated_at
      FROM documents
      WHERE user_id = ? AND parent_id = ?
      ORDER BY type DESC, updated_at DESC
    `).bind(user.id, parentId).all()
  } else {
    documents = await db.prepare(`
      SELECT id, title, type, parent_id, created_at, updated_at
      FROM documents
      WHERE user_id = ? AND (parent_id IS NULL OR parent_id = '')
      ORDER BY type DESC, updated_at DESC
    `).bind(user.id).all()
  }

  return {
    documents: documents.results || []
  }
})
