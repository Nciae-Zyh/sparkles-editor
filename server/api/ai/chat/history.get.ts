import { getDBWithMigration } from '~~/server/utils/db'
import { getCurrentUser } from '~~/server/utils/auth'

interface DBMessage {
  id: string
  role: string
  content: string
}

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const { documentId } = getQuery(event)
  if (!documentId || typeof documentId !== 'string') {
    throw createError({ statusCode: 400, message: 'documentId is required' })
  }

  const db = await getDBWithMigration(event)

  // Find the latest non-deleted session for this document
  const session = await db.prepare(`
    SELECT id FROM ai_chat_sessions
    WHERE user_id = ? AND document_id = ? AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(user.id, documentId).first() as { id: string } | null

  if (!session) {
    return { sessionId: null, messages: [] }
  }

  const { results } = await db.prepare(`
    SELECT id, role, content
    FROM ai_chat_messages
    WHERE session_id = ?
    ORDER BY created_at ASC
  `).bind(session.id).all()

  return {
    sessionId: session.id,
    messages: (results as DBMessage[]).map(m => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content
    }))
  }
})
