import { getDBWithMigration } from '#server/utils/db'
import { getCurrentUser } from '#server/utils/auth'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const { id } = getRouterParams(event)
  const db = await getDBWithMigration(event)

  // Check the document exists
  const doc = await db.prepare(`
    SELECT id, title, deleted_at
    FROM documents
    WHERE id = ? AND user_id = ?
  `).bind(id, user.id).first() as any

  if (!doc || doc.deleted_at) {
    throw createError({ statusCode: 404, message: 'Document not found' })
  }

  // Find documents whose content_preview contains a reference to this document's ID
  // Simple backlink detection: look for the document ID in content
  const backlinks = await db.prepare(`
    SELECT id, title, updated_at, content_preview
    FROM documents
    WHERE user_id = ? AND id != ? AND type = 'document' AND deleted_at IS NULL
    AND (content_preview LIKE ? OR content_preview LIKE ?)
    ORDER BY updated_at DESC
    LIMIT 20
  `).bind(
    user.id,
    id,
    `%${id}%`,
    `%${doc.title}%`
  ).all()

  return {
    backlinks: (backlinks.results || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      updated_at: item.updated_at,
      // Extract a snippet around the match
      snippet: extractSnippet(item.content_preview || '', doc.title || id)
    }))
  }
})

function extractSnippet(content: string, searchTerm: string): string {
  if (!searchTerm) return content.slice(0, 100)
  const lower = content.toLowerCase()
  const term = searchTerm.toLowerCase()
  const idx = lower.indexOf(term)
  if (idx === -1) return content.slice(0, 100)
  const start = Math.max(0, idx - 40)
  const end = Math.min(content.length, idx + searchTerm.length + 40)
  let snippet = content.slice(start, end)
  if (start > 0) snippet = '...' + snippet
  if (end < content.length) snippet = snippet + '...'
  return snippet
}
