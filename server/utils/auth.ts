import { getDB } from './db'
import type { CloudflareEnv } from '~/types'
import { randomBytes, createHash } from 'node:crypto'

const SESSION_SECRET = process.env.SESSION_SECRET || 'your-secret-key-change-in-production'

export function generateToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashPassword(password: string): string {
  return createHash('sha256').update(password + SESSION_SECRET).digest('hex')
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash
}

export async function createSession(event: any, userId: string): Promise<string> {
  const token = generateToken()
  const env = event.context.cloudflare?.env as CloudflareEnv
  const db = env?.DB

  if (!db) {
    throw new Error('Database not available')
  }

  // 将 token 存储在 cookie 中
  setCookie(event, 'auth_token', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30 // 30 天
  })

  // 这里可以将 token 存储在数据库中，用于验证
  // 为了简化，我们使用 JWT 或者直接验证用户 ID
  return token
}

export async function getCurrentUser(event: any): Promise<any | null> {
  const token = getCookie(event, 'auth_token')
  if (!token) {
    return null
  }

  const env = event.context.cloudflare?.env as CloudflareEnv
  const db = env?.DB

  if (!db) {
    return null
  }

  // 从 cookie 中获取用户信息
  // 这里简化处理，实际应该从 token 中解析用户 ID
  // 为了安全，应该使用 JWT 或将会话存储在数据库中
  const userId = getCookie(event, 'user_id')
  if (!userId) {
    return null
  }

  const user = await db.prepare('SELECT id, email, name, avatar_url, created_at, updated_at FROM users WHERE id = ?')
    .bind(userId)
    .first()

  return user as any
}

export async function requireAuth(event: any): Promise<any> {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized'
    })
  }
  return user
}
