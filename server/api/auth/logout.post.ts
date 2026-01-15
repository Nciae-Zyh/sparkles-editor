export default eventHandler(async (event) => {
  deleteCookie(event, 'auth_token')
  deleteCookie(event, 'user_id')

  return {
    success: true
  }
})
