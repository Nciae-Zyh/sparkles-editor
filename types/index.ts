declare global {
  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement
    first<T = unknown>(): Promise<T | null>
    all<T = unknown>(): Promise<{ results?: T[] }>
    run(): Promise<{ success: boolean }>
  }

  interface D1Database {
    prepare(query: string): D1PreparedStatement
  }

  interface R2Bucket {
    get(key: string): Promise<{ text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> } | null>
    put(
      key: string,
      value: string | ArrayBuffer | ArrayBufferView | ReadableStream | Blob,
      options?: { httpMetadata?: { contentType?: string } }
    ): Promise<void>
    delete(key: string): Promise<void>
  }

  // eslint-disable-next-line no-var
  var process: {
    env: Record<string, string | undefined>
    argv: string[]
    cwd(): string
  }
}

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
  content_preview?: string
  r2_key: string
  parent_id?: string | null
  // path 字段已移除，路径通过 parent_id 递归计算
  type: 'document' | 'folder' // 文档或文件夹
  is_favorite?: number
  is_pinned?: number
  tags?: string
  deleted_at?: number | null
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
  permission?: 'read' | 'comment' | 'edit'
  password_hash?: string | null
  expires_at?: number | null
  view_count: number
  created_at: number
  updated_at: number
}
