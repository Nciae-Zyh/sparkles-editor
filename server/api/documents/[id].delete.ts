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

  const { id } = getRouterParams(event)
  const db = await getDBWithMigration(event)

  // 检查文档是否存在且属于当前用户
  const document = await db.prepare(`
    SELECT id, type, deleted_at FROM documents WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first() as any

  if (!document || document.deleted_at) {
    throw createError({
      statusCode: 404,
      message: 'Document not found'
    })
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
    SET deleted_at = ?, updated_at = ?
    WHERE id IN (SELECT id FROM descendants) AND user_id = ?
  `).bind(id, user.id, user.id, now, now, user.id).run()

  return {
    success: true,
    deleted_at: now
  }
})
