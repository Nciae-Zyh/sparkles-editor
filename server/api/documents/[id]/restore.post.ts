import { getDBWithMigration } from '../../../utils/db'
import { getCurrentUser } from '../../../utils/auth'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const { id } = getRouterParams(event)
  const body = await readBody(event).catch(() => ({}))
  const parentId = body?.parentId as string | null | undefined

  const db = await getDBWithMigration(event)
  const item = await db.prepare(`
    SELECT id, parent_id, deleted_at
    FROM documents
    WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first() as any

  if (!item || !item.deleted_at) {
    throw createError({ statusCode: 404, message: 'Document not found in trash' })
  }

  let finalParentId = parentId === undefined ? item.parent_id : parentId
  if (finalParentId) {
    const parent = await db.prepare(`
      SELECT id, type, deleted_at
      FROM documents
      WHERE id = ? AND user_id = ?
    `).bind(finalParentId, user.id).first() as any

    if (!parent || parent.type !== 'folder' || parent.deleted_at) {
      finalParentId = null
    }
  }

  const now = Math.floor(Date.now() / 1000)
  await db.prepare(`
    WITH RECURSIVE descendants AS (
      SELECT id FROM documents WHERE id = ? AND user_id = ?
      UNION ALL
      SELECT d.id
      FROM documents d
      INNER JOIN descendants ds ON d.parent_id = ds.id
      WHERE d.user_id = ?
    )
    UPDATE documents
    SET deleted_at = NULL, updated_at = ?
    WHERE id IN (SELECT id FROM descendants) AND user_id = ?
  `).bind(id, user.id, user.id, now, user.id).run()

  await db.prepare(`
    UPDATE documents
    SET parent_id = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).bind(finalParentId || null, now, id, user.id).run()

  return { success: true, id, parent_id: finalParentId || null }
})
