import { getDB } from '../../utils/db'
import { getCurrentUser } from '../../utils/auth'
import { getR2Bucket, saveDocumentToR2 } from '../../utils/r2'

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
  const { title, content, parentId } = body

  const db = getDB(event)
  if (!db) {
    throw createError({
      statusCode: 500,
      message: 'Database not available'
    })
  }

  // 检查文档是否存在且属于当前用户
  const existing = await db.prepare(`
    SELECT id, r2_key, type, path, parent_id FROM documents WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first() as any

  if (!existing) {
    throw createError({
      statusCode: 404,
      message: 'Document not found'
    })
  }

  const now = Math.floor(Date.now() / 1000)
  let r2Key = existing.r2_key
  let newPath = existing.path
  let newParentId = existing.parent_id

  // 如果父目录改变，更新路径
  if (parentId !== undefined && parentId !== existing.parent_id) {
    let parentPath = '/'
    if (parentId) {
      const parent = await db.prepare('SELECT id, path, type FROM documents WHERE id = ? AND user_id = ?')
        .bind(parentId, user.id)
        .first() as any

      if (!parent || parent.type !== 'folder') {
        throw createError({
          statusCode: 400,
          message: 'Invalid parent folder'
        })
      }

      parentPath = parent.path
    }

    newPath = parentPath === '/' ? `/${id}` : `${parentPath}/${id}`
    newParentId = parentId || null

    // 检查新路径是否已存在
    const pathConflict = await db.prepare('SELECT id FROM documents WHERE path = ? AND user_id = ? AND id != ?')
      .bind(newPath, user.id, id)
      .first()

    if (pathConflict) {
      throw createError({
        statusCode: 409,
        message: 'A document or folder with this name already exists in this location'
      })
    }
  }

  // 如果是文档类型，更新 R2 内容
  if (existing.type === 'document') {
    const r2 = getR2Bucket(event)
    if (!r2) {
      throw createError({
        statusCode: 500,
        message: 'R2 storage not available'
      })
    }

    r2Key = await saveDocumentToR2(r2, user.id, id, content || '')
  }

  // 更新数据库
  await db.prepare(`
    UPDATE documents
    SET title = ?, r2_key = ?, parent_id = ?, path = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).bind(
    title || existing.title,
    r2Key,
    newParentId,
    newPath,
    now,
    id,
    user.id
  ).run()

  return {
    success: true,
    document: {
      id,
      title: title || existing.title,
      parent_id: newParentId,
      path: newPath,
      updated_at: now
    }
  }
})
