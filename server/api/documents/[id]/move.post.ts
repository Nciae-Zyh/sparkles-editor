import { getDBWithMigration } from '../../../utils/db'
import { getCurrentUser } from '../../../utils/auth'
import { isDescendant, getAllDescendants } from '../../../utils/path-helper'
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
    SELECT id, title, type, parent_id FROM documents WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first() as any

  if (!item) {
    throw createError({
      statusCode: 404,
      message: 'Document or folder not found'
    })
  }

  // 如果指定了 parentId，验证父文件夹是否存在
  if (parentId) {
    const parent = await db.prepare(`
      SELECT id, type FROM documents WHERE id = ? AND user_id = ?
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

    // 严格检查循环引用：使用 path-helper 工具函数
    if (item.type === 'folder') {
      const isCircular = await isDescendant(db, user.id, item.id, parentId)
      if (isCircular) {
        throw createError({
          statusCode: 400,
          message: 'Cannot move folder into its own subfolder'
        })
      }
    }
  }

  // 检查目标位置是否已存在同名项（在同一父文件夹下）
  const existing = await db.prepare(`
    SELECT id FROM documents 
    WHERE user_id = ? AND parent_id = ? AND title = ? AND id != ?
  `).bind(user.id, parentId || null, item.title, id).first()

  if (existing) {
    throw createError({
      statusCode: 409,
      message: 'A document or folder with this name already exists in the target location'
    })
  }

  // 更新文档/文件夹的 parent_id
  const now = Math.floor(Date.now() / 1000)
  await db.prepare(`
    UPDATE documents
    SET parent_id = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).bind(
    parentId || null,
    now,
    id,
    user.id
  ).run()

  // 注意：由于不再使用 path 字段，移动文件夹时不需要更新子项的路径
  // 所有路径都通过 parent_id 递归计算

  return {
    success: true,
    document: {
      id,
      parent_id: parentId || null,
      updated_at: now
    } as Partial<Document>
  }
})
