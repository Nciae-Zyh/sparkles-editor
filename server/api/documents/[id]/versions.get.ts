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

  const versions = await db.prepare(`
    SELECT id, title, LENGTH(content) AS content_length, created_at
    FROM document_versions
    WHERE document_id = ? AND user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).bind(id, user.id).all()

  return { versions: versions.results || [] }
})
