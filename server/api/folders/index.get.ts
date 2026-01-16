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

  const db = await getDBWithMigration(event)

  // 获取所有文件夹（用于选择保存位置）
  const folders = await db.prepare(`
    SELECT id, title, parent_id, path
    FROM documents
    WHERE user_id = ? AND type = 'folder'
    ORDER BY path
  `).bind(user.id).all()

  return {
    folders: folders.results || []
  }
})
