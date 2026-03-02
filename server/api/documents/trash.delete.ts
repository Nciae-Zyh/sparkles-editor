import { getDBWithMigration } from '../../utils/db'
import { getCurrentUser } from '../../utils/auth'
import { deleteDocumentFromR2, getR2Bucket } from '../../utils/r2'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const db = await getDBWithMigration(event)
  const trashedDocs = await db.prepare(`
    SELECT r2_key
    FROM documents
    WHERE user_id = ? AND deleted_at IS NOT NULL AND type = 'document' AND r2_key != ''
  `).bind(user.id).all()

  const r2 = getR2Bucket(event)
  for (const row of (trashedDocs.results || []) as Array<{ r2_key?: string }>) {
    if (row.r2_key) {
      await deleteDocumentFromR2(r2, row.r2_key).catch(() => {})
    }
  }

  await db.prepare(`
    DELETE FROM documents
    WHERE user_id = ? AND deleted_at IS NOT NULL
  `).bind(user.id).run()

  return { success: true }
})
