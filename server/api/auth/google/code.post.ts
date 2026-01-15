import { getDB, initDB } from '~/server/utils/db'
import { createSession } from '~/server/utils/auth'
import { randomBytes } from 'node:crypto'

export default eventHandler(async (event) => {
  const body = await readBody(event)
  const code = body.code as string

  if (!code) {
    throw createError({
      statusCode: 400,
      message: 'Authorization code is required'
    })
  }

  const db = getDB(event)
  if (!db) {
    throw createError({
      statusCode: 500,
      message: 'Database not available'
    })
  }

  await initDB(db)

  const config = useRuntimeConfig(event)
  const clientId = config.googleClientId
  const clientSecret = config.googleClientSecret

  if (!clientId || !clientSecret) {
    throw createError({
      statusCode: 500,
      message: 'Google OAuth not configured'
    })
  }

  // useCodeClient 使用当前页面作为 redirect_uri
  // 我们需要从请求中获取实际的 redirect_uri，或者使用配置的站点 URL
  const redirectUri = body.redirectUri || `${config.public.siteUrl || 'http://localhost:3000'}`

  // 交换 code 获取 token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  })

  if (!tokenResponse.ok) {
    const errorData = await tokenResponse.text()
    console.error('Token exchange failed:', errorData)
    throw createError({
      statusCode: 401,
      message: 'Failed to exchange authorization code'
    })
  }

  const tokenData = await tokenResponse.json()
  const accessToken = tokenData.access_token

  // 获取用户信息
  const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!userResponse.ok) {
    const errorData = await userResponse.text()
    console.error('User info fetch failed:', errorData)
    throw createError({
      statusCode: 401,
      message: 'Failed to fetch user information'
    })
  }

  const googleUser = await userResponse.json()

  // 查找或创建用户
  let user = await db.prepare('SELECT id, email, name, avatar_url FROM users WHERE google_id = ? OR email = ?')
    .bind(googleUser.id, googleUser.email)
    .first() as any

  const now = Math.floor(Date.now() / 1000)

  if (user) {
    // 更新现有用户
    if (!user.google_id) {
      await db.prepare('UPDATE users SET google_id = ?, avatar_url = ?, updated_at = ? WHERE id = ?')
        .bind(googleUser.id, googleUser.picture || null, now, user.id)
        .run()
    } else {
      await db.prepare('UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?')
        .bind(googleUser.picture || null, now, user.id)
        .run()
    }
  } else {
    // 创建新用户
    const userId = randomBytes(16).toString('hex')
    await db.prepare(`
      INSERT INTO users (id, email, name, google_id, avatar_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      googleUser.email,
      googleUser.name || null,
      googleUser.id,
      googleUser.picture || null,
      now,
      now
    ).run()

    user = {
      id: userId,
      email: googleUser.email,
      name: googleUser.name || null,
      avatar_url: googleUser.picture || null
    }
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
