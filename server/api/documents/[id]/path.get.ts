import { getDBWithMigration } from '../../../utils/db'
import { getCurrentUser } from '../../../utils/auth'

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
    SELECT id, parent_id, deleted_at FROM documents WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first() as any

  if (!document || document.deleted_at) {
    throw createError({
      statusCode: 404,
      message: 'Document not found'
    })
  }

  // 递归获取所有父文件夹ID（从文档到根目录）
  const parentIds: string[] = []
  let currentParentId: string | null = document.parent_id || null

  while (currentParentId) {
    const parentDoc = await db.prepare(`
      SELECT id, parent_id, deleted_at FROM documents WHERE id = ? AND user_id = ?
    `).bind(currentParentId, user.id).first() as any

    if (!parentDoc || parentDoc.deleted_at) {
      break
    }

    parentIds.push(parentDoc.id)
    currentParentId = parentDoc.parent_id || null
  }

  // 返回从根目录到文档的路径（反转数组）
  return {
    path: parentIds.reverse(),
    documentId: id
  }
})
