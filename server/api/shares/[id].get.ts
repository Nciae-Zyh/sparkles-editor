import { getDBWithMigration } from '../../utils/db'
import { getR2Bucket, getDocumentFromR2 } from '../../utils/r2'
import { verifyPassword } from '../../utils/auth'

export default eventHandler(async (event) => {
  const { id } = getRouterParams(event)
  const query = getQuery(event)
  const password = query.password as string | undefined

  const db = await getDBWithMigration(event)

  // 获取分享信息
  const share = await db.prepare(`
    SELECT 
      s.id,
      s.document_id,
      s.password_hash,
      s.expires_at,
      s.view_count,
      s.created_at,
      d.title as document_title,
      d.r2_key
    FROM shares s
    JOIN documents d ON s.document_id = d.id
    WHERE s.id = ?
  `).bind(id).first() as any

  if (!share) {
    throw createError({
      statusCode: 404,
      message: 'Share not found'
    })
  }

  // 检查是否过期
  const now = Math.floor(Date.now() / 1000)
  if (share.expires_at && share.expires_at < now) {
    throw createError({
      statusCode: 410,
      message: 'Share has expired'
    })
  }

  // 检查密码
  if (share.password_hash) {
    if (!password) {
      throw createError({
        statusCode: 403,
        message: 'Password required'
      })
    }

    const isValidPassword = await verifyPassword(password, share.password_hash)
    if (!isValidPassword) {
      throw createError({
        statusCode: 403,
        message: 'Invalid password'
      })
    }
  }

  // 增加查看次数
  await db.prepare(`
    UPDATE shares 
    SET view_count = view_count + 1, updated_at = ?
    WHERE id = ?
  `).bind(now, id).run()

  // 获取文档内容
  const r2 = getR2Bucket(event)
  let content = null
  if (r2 && share.r2_key) {
    content = await getDocumentFromR2(r2, share.r2_key)
  }

  return {
    share: {
      id: share.id,
      document_id: share.document_id,
      document_title: share.document_title,
      content,
      view_count: (share.view_count || 0) + 1,
      created_at: share.created_at
    }
  }
})
