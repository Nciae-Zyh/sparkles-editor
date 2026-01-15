import { getDB } from '~/server/utils/db'
import { getCurrentUser } from '~/server/utils/auth'
import { getR2Bucket, deleteDocumentFromR2 } from '~/server/utils/r2'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const { id } = getRouterParams(event)
  const db = getDB(event)
  if (!db) {
    throw createError({
      statusCode: 500,
      message: 'Database not available'
    })
  }

  // 检查文档是否存在且属于当前用户
  const document = await db.prepare(`
    SELECT r2_key FROM documents WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first() as any

  if (!document) {
    throw createError({
      statusCode: 404,
      message: 'Document not found'
    })
  }

  // 从 R2 删除
  const r2 = getR2Bucket(event)
  if (r2 && document.r2_key) {
    await deleteDocumentFromR2(r2, document.r2_key)
  }

  // 从数据库删除
  await db.prepare('DELETE FROM documents WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .run()

  return {
    success: true
  }
})
