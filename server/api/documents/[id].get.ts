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

  // 允许获取任何文档（包括其他用户的），用于只读查看
  const document = await db.prepare(`
    SELECT id, title, r2_key, user_id, is_favorite, is_pinned, tags, content_preview, deleted_at, created_at, updated_at
    FROM documents
    WHERE id = ?
  `).bind(id).first() as any

  if (!document || document.deleted_at) {
    throw createError({
      statusCode: 404,
      message: 'Document not found'
    })
  }

  // 从存储获取内容（生产使用 R2，本地使用 Nitro storage）
  const r2 = getR2Bucket(event)
  let content = null
  if (document.r2_key) {
    content = await getDocumentFromR2(r2, document.r2_key)
  }

  return {
    document: {
      ...document,
      content
    }
  }
})
