import { getDBWithMigration } from '../../../utils/db'
import { getCurrentUser } from '../../../utils/auth'
import { deleteDocumentFromR2, getR2Bucket } from '../../../utils/r2'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const { id } = getRouterParams(event)
  const db = await getDBWithMigration(event)

  const root = await db.prepare(`
    SELECT id, deleted_at
    FROM documents
    WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first() as any

  if (!root || !root.deleted_at) {
    throw createError({ statusCode: 404, message: 'Document not found in trash' })
  }

  const descendants = await db.prepare(`
    WITH RECURSIVE items AS (
      SELECT id, r2_key, type FROM documents WHERE id = ? AND user_id = ?
      UNION ALL
      SELECT d.id, d.r2_key, d.type
      FROM documents d
      INNER JOIN items i ON d.parent_id = i.id
      WHERE d.user_id = ?
    )
    SELECT id, r2_key, type FROM items
  `).bind(id, user.id, user.id).all()

  const rows = (descendants.results || []) as Array<{ r2_key?: string, type?: string }>
  const r2 = getR2Bucket(event)
  for (const row of rows) {
    if (row.type === 'document' && row.r2_key) {
      await deleteDocumentFromR2(r2, row.r2_key).catch(() => {})
    }
  }

  await db.prepare(`
    WITH RECURSIVE items AS (
      SELECT id FROM documents WHERE id = ? AND user_id = ?
      UNION ALL
      SELECT d.id
      FROM documents d
      INNER JOIN items i ON d.parent_id = i.id
      WHERE d.user_id = ?
    )
    DELETE FROM documents
    WHERE id IN (SELECT id FROM items) AND user_id = ?
  `).bind(id, user.id, user.id, user.id).run()

  return { success: true }
})
