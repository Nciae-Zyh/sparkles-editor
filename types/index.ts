export interface CloudflareEnv {
  DB?: D1Database
  BLOB?: R2Bucket
}

export interface User {
  id: string
  email: string
  name?: string
  avatar_url?: string
  created_at: number
  updated_at: number
}

export interface Document {
  id: string
  user_id: string
  title: string
  content?: string
  r2_key: string
  created_at: number
  updated_at: number
}

export interface AuthSession {
  user: User
  token: string
}
