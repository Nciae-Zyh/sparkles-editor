import { getDBWithMigration } from '../../utils/db'
import { getCurrentUser, generateDocumentId } from '../../utils/auth'

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

  const db = await getDBWithMigration(event)

  // 验证父目录是否存在且属于当前用户
  if (parentId) {
    const parent = await db.prepare('SELECT id, type FROM documents WHERE id = ? AND user_id = ?')
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
  }

  const folderId = generateDocumentId()
  const now = Math.floor(Date.now() / 1000)

  // 检查同一父文件夹下是否已存在同名文件夹
  const existing = await db.prepare(`
    SELECT id FROM documents 
    WHERE user_id = ? AND parent_id = ? AND title = ? AND type = 'folder'
  `).bind(user.id, parentId || null, title).first()

  if (existing) {
    throw createError({
      statusCode: 409,
      message: 'A folder with this name already exists in this location'
    })
  }

  // 保存到数据库（不再使用 path 字段）
  await db.prepare(`
    INSERT INTO documents (id, user_id, title, r2_key, parent_id, type, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    folderId,
    user.id,
    title,
    '', // 文件夹不需要 R2 key
    parentId || null,
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
      type: 'folder',
      created_at: now,
      updated_at: now
    }
  }
})
