import { getDB, initDB } from '../../utils/db'
import { hashPassword, createSession } from '../../utils/auth'
import { randomBytes } from 'node:crypto'

export default eventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { email, password, name } = body

    console.log('[Register] Request body:', { email, hasPassword: !!password, hasName: !!name })

    if (!email || !password) {
      throw createError({
        statusCode: 400,
        message: 'Email and password are required'
      })
    }

    const db = getDB(event)
    if (!db) {
      console.error('[Register] Database not available')
      throw createError({
        statusCode: 500,
        message: 'Database not available. Please check D1 database configuration.'
      })
    }

    console.log('[Register] Database connection established')

    // 初始化数据库
    try {
      await initDB(db)
      console.log('[Register] Database initialized')
    } catch (initError: any) {
      console.error('[Register] Database initialization failed:', initError)
      throw createError({
        statusCode: 500,
        message: `Database initialization failed: ${initError?.message || 'Unknown error'}`
      })
    }

    // 检查用户是否已存在
    let existingUser
    try {
      existingUser = await db.prepare('SELECT id FROM users WHERE email = ?')
        .bind(email)
        .first()
      console.log('[Register] User check completed', { exists: !!existingUser })
    } catch (checkError: any) {
      console.error('[Register] User check failed:', checkError)
      throw createError({
        statusCode: 500,
        message: `Failed to check existing user: ${checkError?.message || 'Unknown error'}`
      })
    }

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

    console.log('[Register] Creating user:', { userId, email, hasName: !!name })

    try {
      const result = await db.prepare(`
        INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(userId, email, name || null, passwordHash, now, now).run()

      console.log('[Register] User created successfully:', { userId, success: result.success })
    } catch (insertError: any) {
      console.error('[Register] User creation failed:', insertError)
      throw createError({
        statusCode: 500,
        message: `Failed to create user: ${insertError?.message || 'Unknown error'}. Details: ${JSON.stringify(insertError)}`
      })
    }

    // 创建会话
    try {
      await createSession(event, userId)
      console.log('[Register] Session created')
    } catch (sessionError: any) {
      console.error('[Register] Session creation failed:', sessionError)
      throw createError({
        statusCode: 500,
        message: `Failed to create session: ${sessionError?.message || 'Unknown error'}`
      })
    }

    setCookie(event, 'user_id', userId, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30
    })

    console.log('[Register] Registration completed successfully')

    return {
      success: true,
      user: {
        id: userId,
        email,
        name: name || null
      }
    }
  } catch (error: any) {
    // 如果是 createError，直接抛出
    if (error.statusCode) {
      console.error('[Register] Error with status code:', {
        statusCode: error.statusCode,
        message: error.message,
        stack: error.stack
      })
      throw error
    }

    // 其他错误，包装成 500 错误
    console.error('[Register] Unexpected error:', {
      message: error?.message,
      stack: error?.stack,
      error: JSON.stringify(error)
    })

    throw createError({
      statusCode: 500,
      message: `Registration failed: ${error?.message || 'Unknown error'}. Please check server logs for details.`
    })
  }
})
