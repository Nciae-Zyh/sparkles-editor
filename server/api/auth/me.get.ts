import { getCurrentUser } from '#server/utils/auth'

export default eventHandler(async (event) => {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({
      status: 401,
      statusText: 'Unauthorized'
    })
  }

  return {
    user
  }
})
