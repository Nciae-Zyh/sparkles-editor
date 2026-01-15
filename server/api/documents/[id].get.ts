import { getDBWithMigration } from '../../utils/db'
import { getCurrentUser } from '../../utils/auth'
import { getR2Bucket, getDocumentFromR2 } from '../../utils/r2'

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

  const document = await db.prepare(`
    SELECT id, title, r2_key, created_at, updated_at
    FROM documents
    WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first() as any

  if (!document) {
    throw createError({
      statusCode: 404,
      message: 'Document not found'
    })
  }

  // 从 R2 获取内容
  const r2 = getR2Bucket(event)
  let content = null
  if (r2 && document.r2_key) {
    content = await getDocumentFromR2(r2, document.r2_key)
  }

  return {
    document: {
      ...document,
      content
    }
  }
})
