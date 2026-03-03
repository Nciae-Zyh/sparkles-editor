import { getDBWithMigration } from '../../../../../utils/db'
import { generateDocumentId, getCurrentUser } from '../../../../../utils/auth'
import { getDocumentFromR2, getR2Bucket, saveDocumentToR2 } from '../../../../../utils/r2'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const { id, versionId } = getRouterParams(event)
  if (!id || !versionId) {
    throw createError({ statusCode: 400, message: 'Document id and version id are required' })
  }
  const db = await getDBWithMigration(event)

  const doc = await db.prepare(`
    SELECT id, title, r2_key, type, deleted_at
    FROM documents
    WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first() as any

  if (!doc || doc.deleted_at || doc.type !== 'document') {
    throw createError({ statusCode: 404, message: 'Document not found' })
  }

  const version = await db.prepare(`
    SELECT id, title, content
    FROM document_versions
    WHERE id = ? AND document_id = ? AND user_id = ?
  `).bind(versionId, id, user.id).first() as any

  if (!version) {
    throw createError({ statusCode: 404, message: 'Version not found' })
  }

  const now = Math.floor(Date.now() / 1000)
  const r2 = getR2Bucket(event)
  const currentContent = doc.r2_key ? ((await getDocumentFromR2(r2, doc.r2_key)) || '') : ''

  await db.prepare(`
    INSERT INTO document_versions (id, document_id, user_id, title, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(generateDocumentId(), id, user.id, doc.title, currentContent, now).run().catch(() => {})

  const newR2Key = await saveDocumentToR2(r2, user.id, id, version.content || '')
  await db.prepare(`
    UPDATE documents
    SET title = ?, r2_key = ?, content_preview = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).bind(
    version.title || doc.title,
    newR2Key,
    String(version.content || '').slice(0, 2000),
    now,
    id,
    user.id
  ).run()

  return {
    success: true,
    document: {
      id,
      title: version.title || doc.title,
      updated_at: now
    }
  }
})
