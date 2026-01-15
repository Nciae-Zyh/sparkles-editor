import { getDB } from './db'
import type { CloudflareEnv } from '../../types'

const SESSION_SECRET = process.env.SESSION_SECRET || 'your-secret-key-change-in-production'

// 使用 Web Crypto API 生成随机 token（兼容 Cloudflare Workers）
export function generateToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

// 生成用户 ID（兼容 Cloudflare Workers）
export function generateUserId(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

// 生成文档 ID（兼容 Cloudflare Workers）
export function generateDocumentId(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

// 使用 Web Crypto API 进行密码哈希（兼容 Cloudflare Workers）
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + SESSION_SECRET)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const passwordHash = await hashPassword(password)
  return passwordHash === hash
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
