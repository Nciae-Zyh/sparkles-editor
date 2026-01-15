import type { CloudflareEnv } from '../../types'

export function getDB(event: any) {
  const env = event.context.cloudflare?.env as CloudflareEnv
  return env?.DB
}

export async function initDB(db: D1Database) {
  try {
    console.log('[initDB] Starting database initialization')

    // 创建用户表 - 使用 prepare().run() 而不是 exec()
    try {
      await db.prepare(`
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
      `).run()
      console.log('[initDB] Users table created/verified')
    } catch (error: any) {
      console.error('[initDB] Failed to create users table:', error)
      throw new Error(`Failed to create users table: ${error?.message || 'Unknown error'}`)
    }

    // 创建文档表（支持目录结构）
    try {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT,
          r2_key TEXT NOT NULL,
          parent_id TEXT,
          path TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'document',
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (parent_id) REFERENCES documents(id) ON DELETE CASCADE
        )
      `).run()
      console.log('[initDB] Documents table created/verified')

      // 迁移现有数据：为旧数据添加默认路径和类型
      try {
        await db.prepare(`
          UPDATE documents 
          SET path = '/' || id, type = 'document', parent_id = NULL
          WHERE path IS NULL OR path = ''
        `).run()
        console.log('[initDB] Migrated existing documents')
      } catch (migrateError: any) {
        // 迁移失败不影响初始化，可能是新数据库
        console.log('[initDB] No migration needed or migration failed:', migrateError?.message)
      }
    } catch (error: any) {
      console.error('[initDB] Failed to create documents table:', error)
      throw new Error(`Failed to create documents table: ${error?.message || 'Unknown error'}`)
    }

    // 创建索引 - 分别执行每个索引创建语句
    const indexStatements = [
      'CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_documents_parent_id ON documents(parent_id)',
      'CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(path)',
      'CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type)',
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
      'CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)'
    ]

    for (const statement of indexStatements) {
      try {
        await db.prepare(statement).run()
        console.log(`[initDB] Index created: ${statement}`)
      } catch (error: any) {
        // 索引创建失败不应该阻止初始化，只记录错误
        console.warn(`[initDB] Failed to create index: ${statement}`, error?.message)
      }
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
