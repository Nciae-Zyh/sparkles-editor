import { getDBWithMigration } from '~~/server/utils/db'
import { getCurrentUser } from '~~/server/utils/auth'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const body = await readBody(event)
  const { sessionId } = body as { sessionId?: string }

  if (!sessionId) {
    throw createError({ statusCode: 400, message: 'sessionId is required' })
  }

  const db = await getDBWithMigration(event)

  // Verify the session belongs to this user before soft-deleting
  const session = await db.prepare(`
    SELECT id FROM ai_chat_sessions
    WHERE id = ? AND user_id = ?
  `).bind(sessionId, user.id).first()

  if (!session) {
    // Session doesn't exist or doesn't belong to this user — treat as success
    return { ok: true }
  }

  await db.prepare(`
    UPDATE ai_chat_sessions
    SET deleted_at = unixepoch()
    WHERE id = ?
  `).bind(sessionId).run()

  return { ok: true }
})
