import { getDBWithMigration } from '../../../../utils/db'
import { getCurrentUser } from '../../../../utils/auth'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const { id, versionId } = getRouterParams(event)
  const db = await getDBWithMigration(event)

  const version = await db.prepare(`
    SELECT id, title, content, content_length, created_at
    FROM document_versions
    WHERE id = ? AND document_id = ? AND user_id = ?
  `).bind(versionId, id, user.id).first() as any

  if (!version) {
    throw createError({ statusCode: 404, message: 'Version not found' })
  }

  return {
    version: {
      id: version.id,
      title: version.title,
      content: version.content || '',
      content_length: version.content_length || 0,
      created_at: version.created_at
    }
  }
})
