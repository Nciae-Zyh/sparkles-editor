import { getDB } from '~/server/utils/db'
import { getCurrentUser } from '~/server/utils/auth'
import { getR2Bucket, saveDocumentToR2 } from '~/server/utils/r2'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const { id } = getRouterParams(event)
  const body = await readBody(event)
  const { title, content } = body

  const db = getDB(event)
  if (!db) {
    throw createError({
      statusCode: 500,
      message: 'Database not available'
    })
  }

  // 检查文档是否存在且属于当前用户
  const existing = await db.prepare(`
    SELECT id, r2_key FROM documents WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first() as any

  if (!existing) {
    throw createError({
      statusCode: 404,
      message: 'Document not found'
    })
  }

  const r2 = getR2Bucket(event)
  if (!r2) {
    throw createError({
      statusCode: 500,
      message: 'R2 storage not available'
    })
  }

  const now = Math.floor(Date.now() / 1000)

  // 更新 R2 内容
  const r2Key = await saveDocumentToR2(r2, user.id, id, content || '')

  // 更新数据库
  await db.prepare(`
    UPDATE documents
    SET title = ?, r2_key = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).bind(title || existing.title, r2Key, now, id, user.id).run()

  return {
    success: true,
    document: {
      id,
      title: title || existing.title,
      updated_at: now
    }
  }
})
