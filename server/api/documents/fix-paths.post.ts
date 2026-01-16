import { getDBWithMigration } from '../../utils/db'
import { getCurrentUser } from '../../utils/auth'

/**
 * 修复文档结构的工具 API
 * 这个 API 会修复所有文档和文件夹的 parent_id，确保结构正确
 * 注意：不再更新 path 字段，因为已移除
 */
export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const db = await getDBWithMigration(event)

  // 获取用户的所有文档和文件夹
  const allItems = await db.prepare(`
    SELECT id, parent_id, type FROM documents WHERE user_id = ?
  `).bind(user.id).all() as { results: Array<{ id: string, parent_id: string | null, type: string }> }

  const items = allItems.results || []
  const now = Math.floor(Date.now() / 1000)

  // 构建 ID 到文档的映射
  const itemMap = new Map<string, { id: string, parent_id: string | null, type: string }>()
  for (const item of items) {
    itemMap.set(item.id, item)
  }

  const fixed = []
  const errors = []

  for (const item of items) {
    try {
      // 检查 parent_id 是否指向一个有效的文件夹
      if (item.parent_id) {
        const parent = itemMap.get(item.parent_id)
        if (!parent) {
          // 父文件夹不存在，将 parent_id 设置为 null
          console.warn(`[fix-paths] 父文件夹不存在: ${item.id} -> ${item.parent_id}`)
          await db.prepare(`
            UPDATE documents SET parent_id = NULL, updated_at = ? WHERE id = ? AND user_id = ?
          `).bind(now, item.id, user.id).run()
          fixed.push({ id: item.id, action: 'removed_invalid_parent' })
          continue
        }

        if (parent.type !== 'folder') {
          // 父项不是文件夹，将 parent_id 设置为 null
          console.warn(`[fix-paths] 父项不是文件夹: ${item.id} -> ${item.parent_id}`)
          await db.prepare(`
            UPDATE documents SET parent_id = NULL, updated_at = ? WHERE id = ? AND user_id = ?
          `).bind(now, item.id, user.id).run()
          fixed.push({ id: item.id, action: 'removed_invalid_parent_type' })
          continue
        }

        // 检查循环引用
        const checkCircular = (currentId: string, targetId: string, visited: Set<string> = new Set(), depth: number = 0): boolean => {
          if (visited.has(currentId) || depth > 100) return false
          visited.add(currentId)

          const current = itemMap.get(currentId)
          if (!current || !current.parent_id) return false

          if (current.parent_id === targetId) return true

          return checkCircular(current.parent_id, targetId, visited, depth + 1)
        }

        if (checkCircular(item.id, item.id)) {
          // 检测到循环引用，将 parent_id 设置为 null
          console.warn(`[fix-paths] 检测到循环引用: ${item.id}`)
          await db.prepare(`
            UPDATE documents SET parent_id = NULL, updated_at = ? WHERE id = ? AND user_id = ?
          `).bind(now, item.id, user.id).run()
          fixed.push({ id: item.id, action: 'removed_circular_reference' })
          continue
        }
      }

      fixed.push({ id: item.id, action: 'validated' })
    } catch (error: any) {
      console.error(`[fix-paths] 修复失败: ${item.id}`, error)
      errors.push({ id: item.id, error: error.message })
    }
  }

  return {
    success: true,
    fixed: fixed.length,
    errors: errors.length,
    details: {
      fixed,
      errors
    }
  }
})
