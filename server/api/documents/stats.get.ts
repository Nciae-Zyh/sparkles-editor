import { getDBWithMigration } from '#server/utils/db'
import { getCurrentUser } from '#server/utils/auth'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const db = await getDBWithMigration(event)

  // Total documents (excluding deleted and folders)
  const totalDocs = await db.prepare(`
    SELECT COUNT(*) as count
    FROM documents
    WHERE user_id = ? AND type = 'document' AND deleted_at IS NULL
  `).bind(user.id).first() as any

  // Total folders
  const totalFolders = await db.prepare(`
    SELECT COUNT(*) as count
    FROM documents
    WHERE user_id = ? AND type = 'folder' AND deleted_at IS NULL
  `).bind(user.id).first() as any

  // Content preview length as rough word count estimate
  const wordCountResult = await db.prepare(`
    SELECT SUM(LENGTH(content_preview)) as total_chars
    FROM documents
    WHERE user_id = ? AND type = 'document' AND deleted_at IS NULL
  `).bind(user.id).first() as any

  // Active in last 7 days
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 86400
  const activeDocs = await db.prepare(`
    SELECT COUNT(*) as count
    FROM documents
    WHERE user_id = ? AND type = 'document' AND deleted_at IS NULL AND updated_at > ?
  `).bind(user.id, sevenDaysAgo).first() as any

  // Most edited docs (by updated_at frequency - just pick recently updated)
  const topDocs = await db.prepare(`
    SELECT id, title, updated_at, created_at
    FROM documents
    WHERE user_id = ? AND type = 'document' AND deleted_at IS NULL
    ORDER BY updated_at DESC
    LIMIT 5
  `).bind(user.id).all()

  // Recently created
  const recentlyCreated = await db.prepare(`
    SELECT id, title, created_at
    FROM documents
    WHERE user_id = ? AND type = 'document' AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 5
  `).bind(user.id).all()

  return {
    totalDocuments: totalDocs?.count || 0,
    totalFolders: totalFolders?.count || 0,
    totalChars: wordCountResult?.total_chars || 0,
    activeLast7Days: activeDocs?.count || 0,
    topEditedDocuments: topDocs.results || [],
    recentlyCreatedDocuments: recentlyCreated.results || []
  }
})
