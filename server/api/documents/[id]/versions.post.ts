import { getDBWithMigration } from '../../../utils/db'
import { generateDocumentId, getCurrentUser } from '../../../utils/auth'
import { getDocumentFromR2, getR2Bucket } from '../../../utils/r2'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const { id } = getRouterParams(event)
  const body = await readBody(event).catch(() => ({}))
  const db = await getDBWithMigration(event)

  const doc = await db.prepare(`
    SELECT id, title, r2_key, type, deleted_at
    FROM documents
    WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first() as any

  if (!doc || doc.deleted_at || doc.type !== 'document') {
    throw createError({ statusCode: 404, message: 'Document not found' })
  }

  let content = typeof body?.content === 'string' ? body.content : ''
  if (!content) {
    const r2 = getR2Bucket(event)
    content = (await getDocumentFromR2(r2, doc.r2_key)) || ''
  }
  const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : doc.title

  const versionId = generateDocumentId()
  const now = Math.floor(Date.now() / 1000)
  await db.prepare(`
    INSERT INTO document_versions (id, document_id, user_id, title, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(versionId, id, user.id, title, content, now).run()

  return {
    success: true,
    version: {
      id: versionId,
      document_id: id,
      title,
      created_at: now
    }
  }
})
