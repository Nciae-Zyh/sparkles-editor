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

  // 获取用户的所有分享，包含文档信息
  const shares = await db.prepare(`
    SELECT 
      s.id,
      s.document_id,
      s.permission,
      s.password_hash,
      s.expires_at,
      s.view_count,
      s.created_at,
      s.updated_at,
      d.title as document_title
    FROM shares s
    JOIN documents d ON s.document_id = d.id
    WHERE s.user_id = ?
    ORDER BY s.created_at DESC
  `).bind(user.id).all()

  const now = Math.floor(Date.now() / 1000)

  return {
    shares: (shares.results || []).map((share: any) => ({
      id: share.id,
      document_id: share.document_id,
      document_title: share.document_title,
      permission: share.permission || 'read',
      has_password: !!share.password_hash,
      expires_at: share.expires_at,
      is_expired: share.expires_at ? share.expires_at < now : false,
      view_count: share.view_count || 0,
      created_at: share.created_at,
      updated_at: share.updated_at
    }))
  }
})
