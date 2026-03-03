import { getCurrentUser } from '../utils/auth'

/**
 * Protect all /api/ai/* routes — authentication required.
 * This single middleware replaces per-endpoint auth checks.
 */
export default defineEventHandler(async (event) => {
  if (!event.path.startsWith('/api/ai/')) return

  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'Authentication required to use AI features'
    })
  }
})
