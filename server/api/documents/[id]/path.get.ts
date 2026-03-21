import { getDBWithMigration } from '../../../utils/db'
import { getCurrentUser } from '../../../utils/auth'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }

  const { id } = getRouterParams(event)
  const db = await getDBWithMigration(event)

  // Check if the document exists (allow any user's doc for read-only viewing)
  const document = await db.prepare(`
    SELECT id, title, parent_id, deleted_at FROM documents WHERE id = ?
  `).bind(id).first() as any

  if (!document || document.deleted_at) {
    throw createError({
      statusCode: 404,
      message: 'Document not found'
    })
  }

  // Recursively get all parent folders (from document to root)
  const parents: Array<{ id: string, title: string }> = []
  let currentParentId: string | null = document.parent_id || null

  while (currentParentId) {
    const parentDoc = await db.prepare(`
      SELECT id, title, parent_id, deleted_at FROM documents WHERE id = ?
    `).bind(currentParentId).first() as any

    if (!parentDoc || parentDoc.deleted_at) {
      break
    }

    parents.push({ id: parentDoc.id, title: parentDoc.title })
    currentParentId = parentDoc.parent_id || null
  }

  // Return path from root to document (reverse array)
  return {
    path: parents.reverse(),
    documentId: id
  }
})
