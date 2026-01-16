import { getDBWithMigration } from '../../utils/db'
import { getCurrentUser } from '../../utils/auth'
import type { Document } from '~/types'

interface DocumentTreeNode extends Document {
  children?: DocumentTreeNode[]
}

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const db = await getDBWithMigration(event)

  // 使用递归 CTE 优化深层级查询
  // 获取用户的所有文档和文件夹，按层级排序
  const allItems = await db.prepare(`
    WITH RECURSIVE folder_tree AS (
      -- 根节点（parent_id IS NULL）
      SELECT 
        id, title, type, parent_id, created_at, updated_at,
        0 as depth,
        CAST(id AS TEXT) as path_ids
      FROM documents
      WHERE user_id = ? AND parent_id IS NULL
      
      UNION ALL
      
      -- 递归查询子节点
      SELECT 
        d.id, d.title, d.type, d.parent_id, d.created_at, d.updated_at,
        ft.depth + 1 as depth,
        ft.path_ids || '/' || d.id as path_ids
      FROM documents d
      INNER JOIN folder_tree ft ON d.parent_id = ft.id
      WHERE d.user_id = ? AND ft.depth < 100  -- 限制最大深度为100层
    )
    SELECT id, title, type, parent_id, created_at, updated_at, depth
    FROM folder_tree
    ORDER BY type DESC, title ASC
  `).bind(user.id, user.id).all() as { results: Document[] }

  const items = allItems.results || []

  // 构建树形结构
  const itemMap = new Map<string, DocumentTreeNode>()
  const rootItems: DocumentTreeNode[] = []

  // 第一遍：创建所有节点的映射
  for (const item of items) {
    itemMap.set(item.id, { ...item, children: [] })
  }

  // 第二遍：构建父子关系
  for (const item of items) {
    const node = itemMap.get(item.id)!
    if (item.parent_id && itemMap.has(item.parent_id)) {
      const parent = itemMap.get(item.parent_id)!
      if (!parent.children) {
        parent.children = []
      }
      parent.children.push(node)
    } else {
      rootItems.push(node)
    }
  }

  // 递归排序：文件夹在前，文档在后，然后按标题排序
  const sortTree = (nodes: DocumentTreeNode[]): DocumentTreeNode[] => {
    return nodes
      .sort((a, b) => {
        // 文件夹优先
        if (a.type === 'folder' && b.type !== 'folder') return -1
        if (a.type !== 'folder' && b.type === 'folder') return 1
        // 同类型按标题排序
        return a.title.localeCompare(b.title)
      })
      .map(node => ({
        ...node,
        children: node.children ? sortTree(node.children) : []
      }))
  }

  return {
    tree: sortTree(rootItems),
    flat: items // 同时返回扁平列表以便于搜索
  }
})
