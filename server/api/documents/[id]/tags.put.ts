import { getDBWithMigration } from '../../../utils/db'
import { getCurrentUser } from '../../../utils/auth'

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const values = raw
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 12)
    .map(item => item.slice(0, 24))
  return Array.from(new Set(values))
}

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const { id } = getRouterParams(event)
  const body = await readBody(event).catch(() => ({}))
  const tags = normalizeTags(body?.tags)

  const db = await getDBWithMigration(event)
  const exists = await db.prepare(`
    SELECT id, deleted_at
    FROM documents
    WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first() as any

  if (!exists || exists.deleted_at) {
    throw createError({ statusCode: 404, message: 'Document not found' })
  }

  const now = Math.floor(Date.now() / 1000)
  await db.prepare(`
    UPDATE documents
    SET tags = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).bind(JSON.stringify(tags), now, id, user.id).run()

  return { success: true, tags }
})
