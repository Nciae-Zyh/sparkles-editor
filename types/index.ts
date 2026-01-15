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
  path: string // 完整路径，如 "/folder1/folder2/document"
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
