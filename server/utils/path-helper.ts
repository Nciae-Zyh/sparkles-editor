/**
 * 路径计算工具函数
 * 基于 parent_id 递归计算路径，不依赖数据库中的 path 字段
 */

/**
 * 递归计算文档/文件夹的完整路径
 * @param db 数据库连接
 * @param userId 用户ID
 * @param itemId 文档/文件夹ID
 * @param maxDepth 最大递归深度（防止无限循环），默认100
 * @returns 完整路径，如 "/folder1/folder2/document"
 */
export async function calculatePath(
  db: D1Database,
  userId: string,
  itemId: string,
  maxDepth: number = 100
): Promise<string> {
  const pathParts: string[] = []
  let currentId: string | null = itemId
  let depth = 0

  while (currentId && depth < maxDepth) {
    const item = await db.prepare(`
      SELECT id, parent_id FROM documents 
      WHERE id = ? AND user_id = ?
    `).bind(currentId, userId).first() as { id: string, parent_id: string | null } | undefined

    if (!item) {
      break
    }

    pathParts.unshift(item.id)
    currentId = item.parent_id
    depth++

    // 防止循环引用
    if (pathParts.length > 1 && pathParts[0] === pathParts[pathParts.length - 1]) {
      console.warn(`[calculatePath] 检测到循环引用: ${itemId}`)
      break
    }
  }

  return '/' + pathParts.join('/')
}

/**
 * 批量计算路径（优化版本，减少数据库查询）
 * @param db 数据库连接
 * @param userId 用户ID
 * @param itemIds 文档/文件夹ID数组
 * @returns Map<itemId, path>
 */
export async function calculatePathsBatch(
  db: D1Database,
  userId: string,
  itemIds: string[]
): Promise<Map<string, string>> {
  const pathMap = new Map<string, string>()
  
  // 获取所有相关的文档
  const placeholders = itemIds.map(() => '?').join(',')
  const allItems = await db.prepare(`
    SELECT id, parent_id FROM documents 
    WHERE user_id = ? AND (id IN (${placeholders}) OR parent_id IN (${placeholders}))
  `).bind(userId, ...itemIds, ...itemIds).all() as { results: Array<{ id: string, parent_id: string | null }> }

  // 构建 ID 到 parent_id 的映射
  const itemMap = new Map<string, string | null>()
  for (const item of allItems.results) {
    itemMap.set(item.id, item.parent_id)
  }

  // 为每个 itemId 计算路径
  for (const itemId of itemIds) {
    const pathParts: string[] = []
    let currentId: string | null = itemId
    const visited = new Set<string>()
    let depth = 0

    while (currentId && depth < 100) {
      if (visited.has(currentId)) {
        console.warn(`[calculatePathsBatch] 检测到循环引用: ${itemId}`)
        break
      }
      visited.add(currentId)

      const parentId = itemMap.get(currentId)
      if (parentId === undefined) {
        // 如果找不到，尝试从数据库查询
        const item = await db.prepare(`
          SELECT parent_id FROM documents WHERE id = ? AND user_id = ?
        `).bind(currentId, userId).first() as { parent_id: string | null } | undefined
        
        if (!item) break
        itemMap.set(currentId, item.parent_id)
        pathParts.unshift(currentId)
        currentId = item.parent_id
      } else {
        pathParts.unshift(currentId)
        currentId = parentId
      }
      depth++
    }

    pathMap.set(itemId, '/' + pathParts.join('/'))
  }

  return pathMap
}

/**
 * 检查是否是子项（防止循环引用）
 * @param db 数据库连接
 * @param userId 用户ID
 * @param parentId 父文件夹ID
 * @param childId 子项ID
 * @param maxDepth 最大递归深度
 * @returns true 如果是子项
 */
export async function isDescendant(
  db: D1Database,
  userId: string,
  parentId: string,
  childId: string,
  maxDepth: number = 100
): Promise<boolean> {
  if (parentId === childId) return true

  let currentId: string | null = childId
  let depth = 0
  const visited = new Set<string>()

  while (currentId && depth < maxDepth) {
    if (visited.has(currentId)) {
      return false // 检测到循环，返回 false
    }
    visited.add(currentId)

    const item = await db.prepare(`
      SELECT parent_id FROM documents 
      WHERE id = ? AND user_id = ?
    `).bind(currentId, userId).first() as { parent_id: string | null } | undefined

    if (!item) return false

    if (item.parent_id === parentId) {
      return true
    }

    currentId = item.parent_id
    depth++
  }

  return false
}

/**
 * 获取所有子项ID（递归）
 * @param db 数据库连接
 * @param userId 用户ID
 * @param folderId 文件夹ID
 * @param maxDepth 最大递归深度
 * @returns 所有子项ID数组
 */
export async function getAllDescendants(
  db: D1Database,
  userId: string,
  folderId: string,
  maxDepth: number = 100
): Promise<string[]> {
  const descendants: string[] = []
  const queue: Array<{ id: string, depth: number }> = [{ id: folderId, depth: 0 }]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!
    
    if (visited.has(id) || depth >= maxDepth) continue
    visited.add(id)

    const children = await db.prepare(`
      SELECT id FROM documents 
      WHERE parent_id = ? AND user_id = ?
    `).bind(id, userId).all() as { results: Array<{ id: string }> }

    for (const child of children.results) {
      descendants.push(child.id)
      queue.push({ id: child.id, depth: depth + 1 })
    }
  }

  return descendants
}
