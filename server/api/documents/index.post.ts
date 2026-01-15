import { getDB } from '../../utils/db'
import { getCurrentUser } from '../../utils/auth'
import { getR2Bucket, saveDocumentToR2 } from '../../utils/r2'
import { randomBytes } from 'node:crypto'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const body = await readBody(event)
  const { title, content } = body

  if (!title) {
    throw createError({
      statusCode: 400,
      message: 'Title is required'
    })
  }

  const db = getDB(event)
  if (!db) {
    throw createError({
      statusCode: 500,
      message: 'Database not available'
    })
  }

  const r2 = getR2Bucket(event)
  if (!r2) {
    throw createError({
      statusCode: 500,
      message: 'R2 storage not available'
    })
  }

  const documentId = randomBytes(16).toString('hex')
  const now = Math.floor(Date.now() / 1000)

  // 保存到 R2
  const r2Key = await saveDocumentToR2(r2, user.id, documentId, content || '')

  // 保存到数据库
  await db.prepare(`
    INSERT INTO documents (id, user_id, title, r2_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(documentId, user.id, title, r2Key, now, now).run()

  return {
    success: true,
    document: {
      id: documentId,
      title,
      created_at: now,
      updated_at: now
    }
  }
})
