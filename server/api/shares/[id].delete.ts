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

  // 检查分享是否存在且属于当前用户
  const share = await db.prepare(`
    SELECT id FROM shares WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first() as any

  if (!share) {
    throw createError({
      statusCode: 404,
      message: 'Share not found'
    })
  }

  // 删除分享
  await db.prepare('DELETE FROM shares WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .run()

  return {
    success: true
  }
})
