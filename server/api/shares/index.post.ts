import { getDBWithMigration } from '../../utils/db'
import { getCurrentUser, hashPassword, generateDocumentId } from '../../utils/auth'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const body = await readBody(event)
  const { document_id, password, expires_at, permission } = body
  const sharePermission = ['read', 'comment', 'edit'].includes(permission) ? permission : 'read'

  if (!document_id) {
    throw createError({
      statusCode: 400,
      message: 'Document ID is required'
    })
  }

  const db = await getDBWithMigration(event)

  // 检查文档是否存在且属于当前用户
  const document = await db.prepare(`
    SELECT id, title, type, deleted_at FROM documents WHERE id = ? AND user_id = ?
  `).bind(document_id, user.id).first() as any

  if (!document || document.deleted_at) {
    throw createError({
      statusCode: 404,
      message: 'Document not found'
    })
  }

  // 只有文档类型可以分享，文件夹不能分享
  if (document.type !== 'document') {
    throw createError({
      statusCode: 400,
      message: 'Only documents can be shared'
    })
  }

  // 生成分享 ID
  const shareId = generateDocumentId()

  // 处理密码
  let passwordHash: string | null = null
  if (password && password.trim()) {
    passwordHash = await hashPassword(password.trim())
  }

  // 处理过期时间
  let expiresAt: number | null = null
  if (expires_at) {
    const expiresDate = new Date(expires_at)
    if (isNaN(expiresDate.getTime())) {
      throw createError({
        statusCode: 400,
        message: 'Invalid expires_at format'
      })
    }
    expiresAt = Math.floor(expiresDate.getTime() / 1000)
  }

  // 创建分享记录
  const now = Math.floor(Date.now() / 1000)
  await db.prepare(`
    INSERT INTO shares (id, document_id, user_id, permission, password_hash, expires_at, view_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).bind(shareId, document_id, user.id, sharePermission, passwordHash, expiresAt, now, now).run()

  return {
    success: true,
    share: {
      id: shareId,
      document_id,
      document_title: document.title,
      permission: sharePermission,
      expires_at: expiresAt,
      has_password: !!passwordHash,
      view_count: 0,
      created_at: now
    }
  }
})
