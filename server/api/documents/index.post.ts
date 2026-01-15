import { getDB } from '../../utils/db'
import { getCurrentUser, generateDocumentId } from '../../utils/auth'
import { getR2Bucket, saveDocumentToR2 } from '../../utils/r2'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const body = await readBody(event)
  const { title, content, parentId, type = 'document' } = body

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

  // 验证父目录是否存在且属于当前用户
  let parentPath = '/'
  if (parentId) {
    const parent = await db.prepare('SELECT id, path, type FROM documents WHERE id = ? AND user_id = ?')
      .bind(parentId, user.id)
      .first() as any

    if (!parent) {
      throw createError({
        statusCode: 404,
        message: 'Parent folder not found'
      })
    }

    if (parent.type !== 'folder') {
      throw createError({
        statusCode: 400,
        message: 'Parent must be a folder'
      })
    }

    parentPath = parent.path
  }

  const documentId = generateDocumentId()
  const now = Math.floor(Date.now() / 1000)
  const path = parentPath === '/' ? `/${documentId}` : `${parentPath}/${documentId}`

  // 检查路径是否已存在
  const existing = await db.prepare('SELECT id FROM documents WHERE path = ? AND user_id = ?')
    .bind(path, user.id)
    .first()

  if (existing) {
    throw createError({
      statusCode: 409,
      message: 'A document or folder with this name already exists in this location'
    })
  }

  let r2Key = ''
  if (type === 'document') {
    const r2 = getR2Bucket(event)
    if (!r2) {
      throw createError({
        statusCode: 500,
        message: 'R2 storage not available'
      })
    }

    // 保存到 R2
    r2Key = await saveDocumentToR2(r2, user.id, documentId, content || '')
  } else {
    // 文件夹不需要 R2 key
    r2Key = ''
  }

  // 保存到数据库
  await db.prepare(`
    INSERT INTO documents (id, user_id, title, r2_key, parent_id, path, type, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    documentId,
    user.id,
    title,
    r2Key,
    parentId || null,
    path,
    type,
    now,
    now
  ).run()

  return {
    success: true,
    document: {
      id: documentId,
      title,
      parent_id: parentId || null,
      path,
      type,
      created_at: now,
      updated_at: now
    }
  }
})
