import { getDBWithMigration } from '~~/server/utils/db'
import { getCurrentUser } from '~~/server/utils/auth'

/**
 * 获取指定文件夹的子项（懒加载）
 */
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

  // 验证文件夹是否存在且属于当前用户
  const folder = await db.prepare(`
    SELECT id, type FROM documents WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first() as any

  if (!folder) {
    throw createError({
      statusCode: 404,
      message: 'Folder not found'
    })
  }

  if (folder.type !== 'folder') {
    throw createError({
      statusCode: 400,
      message: 'Item is not a folder'
    })
  }

  // 获取文件夹的直接子项
  const children = await db.prepare(`
    SELECT id, title, type, parent_id, created_at, updated_at
    FROM documents
    WHERE user_id = ? AND parent_id = ?
    ORDER BY type DESC, title ASC
  `).bind(user.id, id).all()

  return {
    children: children.results || []
  }
})
