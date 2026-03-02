import { getDBWithMigration } from './db'

const SESSION_SECRET = process.env.SESSION_SECRET || 'your-secret-key-change-in-production'

export function generateToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

export function generateUserId(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

export function generateDocumentId(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

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

  setCookie(event, 'auth_token', token, {
    httpOnly: true,
    secure: !import.meta.dev,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30
  })

  return token
}

export async function getCurrentUser(event: any): Promise<any | null> {
  const token = getCookie(event, 'auth_token')
  if (!token) return null

  const userId = getCookie(event, 'user_id')
  if (!userId) return null

  try {
    const db = await getDBWithMigration(event)
    const user = await db.prepare(
      'SELECT id, email, name, avatar_url, created_at, updated_at FROM users WHERE id = ?'
    ).bind(userId).first()
    return user as any
  } catch {
    return null
  }
}

export async function requireAuth(event: any): Promise<any> {
  const user = await getCurrentUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
  return user
}
