import { getDB, initDB } from '~/server/utils/db'
import { hashPassword, createSession } from '~/server/utils/auth'
import { randomBytes } from 'node:crypto'

export default eventHandler(async (event) => {
  const body = await readBody(event)
  const { email, password, name } = body

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

  // 初始化数据库
  await initDB(db)

  // 检查用户是否已存在
  const existingUser = await db.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first()

  if (existingUser) {
    throw createError({
      statusCode: 409,
      message: 'User already exists'
    })
  }

  // 创建新用户
  const userId = randomBytes(16).toString('hex')
  const passwordHash = hashPassword(password)
  const now = Math.floor(Date.now() / 1000)

  await db.prepare(`
    INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(userId, email, name || null, passwordHash, now, now).run()

  // 创建会话
  await createSession(event, userId)

  setCookie(event, 'user_id', userId, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30
  })

  return {
    success: true,
    user: {
      id: userId,
      email,
      name: name || null
    }
  }
})
