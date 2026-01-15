import { getDB } from '../../utils/db'
import { getCurrentUser } from '../../utils/auth'
import { generateDocumentId } from '../../utils/auth'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const body = await readBody(event)
  const { title, parentId } = body

  if (!title) {
    throw createError({
      statusCode: 400,
      message: 'Folder name is required'
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

  const folderId = generateDocumentId()
  const now = Math.floor(Date.now() / 1000)
  const path = parentPath === '/' ? `/${folderId}` : `${parentPath}/${folderId}`

  // 检查路径是否已存在
  const existing = await db.prepare('SELECT id FROM documents WHERE path = ? AND user_id = ?')
    .bind(path, user.id)
    .first()

  if (existing) {
    throw createError({
      statusCode: 409,
      message: 'A folder with this name already exists in this location'
    })
  }

  // 保存到数据库
  await db.prepare(`
    INSERT INTO documents (id, user_id, title, r2_key, parent_id, path, type, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    folderId,
    user.id,
    title,
    '', // 文件夹不需要 R2 key
    parentId || null,
    path,
    'folder',
    now,
    now
  ).run()

  return {
    success: true,
    folder: {
      id: folderId,
      title,
      parent_id: parentId || null,
      path,
      type: 'folder',
      created_at: now,
      updated_at: now
    }
  }
})
