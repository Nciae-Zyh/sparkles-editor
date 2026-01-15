import { getDB } from '../../utils/db'
import { verifyPassword, createSession } from '../../utils/auth'

export default eventHandler(async (event) => {
  const body = await readBody(event)
  const { email, password } = body

  if (!email || !password) {
    throw createError({
      statusCode: 400,
      message: 'Email and password are required'
    })
  }

  const db = getDB(event)
  if (!db) {
    throw createError({
      statusCode: 500,
      message: 'Database not available'
    })
  }

  // 查找用户
  const user = await db.prepare('SELECT id, email, name, password_hash, avatar_url FROM users WHERE email = ?')
    .bind(email)
    .first() as any

  if (!user || !user.password_hash) {
    throw createError({
      statusCode: 401,
      message: 'Invalid email or password'
    })
  }

  // 验证密码
  const isValidPassword = await verifyPassword(password, user.password_hash)
  if (!isValidPassword) {
    throw createError({
      statusCode: 401,
      message: 'Invalid email or password'
    })
  }

  // 创建会话
  await createSession(event, user.id)

  setCookie(event, 'user_id', user.id, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30
  })

  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url
    }
  }
})
