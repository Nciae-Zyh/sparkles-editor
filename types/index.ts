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
  parent_id?: string | null
  // path 字段已移除，路径通过 parent_id 递归计算
  type: 'document' | 'folder' // 文档或文件夹
  created_at: number
  updated_at: number
}

export interface Folder extends Document {
  type: 'folder'
}

export interface AuthSession {
  user: User
  token: string
}

export interface Share {
  id: string
  document_id: string
  user_id: string
  password_hash?: string | null
  expires_at?: number | null
  view_count: number
  created_at: number
  updated_at: number
}
