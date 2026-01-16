import { getDBWithMigration } from '../../../utils/db'
import { getCurrentUser } from '../../../utils/auth'
import type { Document } from '~/types'

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
  const { parentId } = body

  if (parentId !== undefined && parentId !== null && typeof parentId !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'Invalid parentId'
    })
  }

  const db = await getDBWithMigration(event)

  // 检查要移动的文档/文件夹是否存在且属于当前用户
  const item = await db.prepare(`
    SELECT id, title, type, path, parent_id FROM documents WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first() as any

  if (!item) {
    throw createError({
      statusCode: 404,
      message: 'Document or folder not found'
    })
  }

  // 如果指定了 parentId，验证父文件夹是否存在
  let newParentPath = '/'
  if (parentId) {
    const parent = await db.prepare(`
      SELECT id, path, type FROM documents WHERE id = ? AND user_id = ?
    `).bind(parentId, user.id).first() as any

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

    // 检查是否试图将文件夹移动到自己的子文件夹中（防止循环引用）
    if (item.type === 'folder' && parent.path.startsWith(item.path + '/')) {
      throw createError({
        statusCode: 400,
        message: 'Cannot move folder into its own subfolder'
      })
    }

    newParentPath = parent.path
  }

  // 计算新路径
  const newPath = newParentPath === '/' ? `/${id}` : `${newParentPath}/${id}`

  // 检查新路径是否已存在（除了当前项本身）
  const existing = await db.prepare(`
    SELECT id FROM documents WHERE path = ? AND user_id = ? AND id != ?
  `).bind(newPath, user.id, id).first()

  if (existing) {
    throw createError({
      statusCode: 409,
      message: 'A document or folder with this name already exists in the target location'
    })
  }

  // 更新文档/文件夹的 parent_id 和 path
  const now = Math.floor(Date.now() / 1000)
  await db.prepare(`
    UPDATE documents
    SET parent_id = ?, path = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).bind(
    parentId || null,
    newPath,
    now,
    id,
    user.id
  ).run()

  // 如果移动的是文件夹，需要递归更新所有子项的路径
  if (item.type === 'folder') {
    const updateChildrenPaths = async (oldPath: string, newPath: string) => {
      const children = await db.prepare(`
        SELECT id, path FROM documents WHERE path LIKE ? AND user_id = ?
      `).bind(`${oldPath}/%`, user.id).all() as { results: Array<{ id: string, path: string }> }

      for (const child of children.results) {
        const newChildPath = child.path.replace(oldPath, newPath)
        await db.prepare(`
          UPDATE documents SET path = ?, updated_at = ? WHERE id = ? AND user_id = ?
        `).bind(newChildPath, now, child.id, user.id).run()
      }
    }

    await updateChildrenPaths(item.path, newPath)
  }

  return {
    success: true,
    document: {
      id,
      parent_id: parentId || null,
      path: newPath,
      updated_at: now
    } as Partial<Document>
  }
})
