import { getDBWithMigration } from '../../../utils/db'
import { getCurrentUser, generateDocumentId } from '../../../utils/auth'
import { getR2Bucket, saveDocumentToR2, getDocumentFromR2 } from '../../../utils/r2'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const { id } = getRouterParams(event)
  const db = await getDBWithMigration(event)

  // Fetch the original document
  const doc = await db.prepare(`
    SELECT id, title, r2_key, parent_id, type, tags, deleted_at
    FROM documents
    WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first() as any

  if (!doc || doc.deleted_at) {
    throw createError({ statusCode: 404, message: 'Document not found' })
  }

  // Only documents can be cloned, not folders
  if (doc.type !== 'document') {
    throw createError({ statusCode: 400, message: 'Only documents can be cloned' })
  }

  const newId = generateDocumentId()
  const now = Math.floor(Date.now() / 1000)
  const newTitle = `${doc.title} (copy)`

  // Read content from R2
  let content = ''
  if (doc.r2_key) {
    const r2 = getR2Bucket(event)
    content = await getDocumentFromR2(r2, doc.r2_key) || ''
  }

  // Save cloned content to R2
  const r2 = getR2Bucket(event)
  const newR2Key = await saveDocumentToR2(r2, user.id, newId, content)

  // Insert cloned document into database
  await db.prepare(`
    INSERT INTO documents (id, user_id, title, r2_key, parent_id, type, content_preview, tags, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    newId,
    user.id,
    newTitle,
    newR2Key,
    doc.parent_id || null,
    'document',
    content.slice(0, 2000),
    doc.tags || null,
    now,
    now
  ).run()

  return {
    success: true,
    document: {
      id: newId,
      title: newTitle,
      parent_id: doc.parent_id,
      type: 'document',
      created_at: now,
      updated_at: now
    }
  }
})
