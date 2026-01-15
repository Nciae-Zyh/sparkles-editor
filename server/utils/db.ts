import type { CloudflareEnv } from '../../types'

export function getDB(event: any) {
  const env = event.context.cloudflare?.env as CloudflareEnv
  return env?.DB
}

export async function initDB(db: D1Database) {
  try {
    console.log('[initDB] Starting database initialization')
    
    // 创建用户表
    try {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          name TEXT,
          password_hash TEXT,
          google_id TEXT UNIQUE,
          avatar_url TEXT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        )
      `)
      console.log('[initDB] Users table created/verified')
    } catch (error: any) {
      console.error('[initDB] Failed to create users table:', error)
      throw new Error(`Failed to create users table: ${error?.message || 'Unknown error'}`)
    }

    // 创建文档表
    try {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT,
          r2_key TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `)
      console.log('[initDB] Documents table created/verified')
    } catch (error: any) {
      console.error('[initDB] Failed to create documents table:', error)
      throw new Error(`Failed to create documents table: ${error?.message || 'Unknown error'}`)
    }

    // 创建索引
    try {
      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
        CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
      `)
      console.log('[initDB] Indexes created/verified')
    } catch (error: any) {
      console.error('[initDB] Failed to create indexes:', error)
      // 索引创建失败不应该阻止初始化，只记录错误
      console.warn('[initDB] Continuing despite index creation errors')
    }

    console.log('[initDB] Database initialization completed successfully')
  } catch (error: any) {
    console.error('[initDB] Database initialization failed:', {
      message: error?.message,
      stack: error?.stack,
      error: error
    })
    throw error
  }
}
