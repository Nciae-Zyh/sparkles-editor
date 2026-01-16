import type { CloudflareEnv } from '../../types'

export function getDB(event: any) {
  const env = event.context.cloudflare?.env as CloudflareEnv
  return env?.DB
}

/**
 * 获取数据库并确保迁移已完成
 */
export async function getDBWithMigration(event: any): Promise<D1Database> {
  const db = getDB(event)
  if (!db) {
    throw new Error('Database not available')
  }

  // 执行迁移检查（非阻塞，失败不影响主流程）
  try {
    await migrateDB(db)
  } catch (error: any) {
    console.warn('[getDBWithMigration] Migration check failed:', error?.message)
    // 迁移失败不应该阻止 API 调用，只记录警告
  }

  return db
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
    // 新结构：移除 path 字段，只保留核心字段
    // 路径通过 parent_id 递归计算，避免数据不一致
    try {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT,
          r2_key TEXT NOT NULL DEFAULT '',
          parent_id TEXT,
          type TEXT NOT NULL DEFAULT 'document',
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (parent_id) REFERENCES documents(id) ON DELETE CASCADE
        )
      `).run()
      console.log('[initDB] Documents table created/verified')
    } catch (error: any) {
      console.error('[initDB] Failed to create documents table:', error)
      throw new Error(`Failed to create documents table: ${error?.message || 'Unknown error'}`)
    }

    // 数据库迁移：检查并添加缺失的列
    await migrateDB(db)

    // 创建索引 - 分别执行每个索引创建语句
    // 移除 path 索引，因为不再使用 path 字段
    const indexStatements = [
      'CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_documents_parent_id ON documents(parent_id)',
      'CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type)',
      'CREATE INDEX IF NOT EXISTS idx_documents_user_parent ON documents(user_id, parent_id)',
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

/**
 * 数据库迁移：检查并添加缺失的列
 */
export async function migrateDB(db: D1Database) {
  try {
    console.log('[migrateDB] Starting database migration')

    // 检查表是否存在
    const tableInfo = await db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='documents'
    `).first()

    if (!tableInfo) {
      console.log('[migrateDB] Documents table does not exist, skipping migration')
      return
    }

    // 获取现有列信息
    const columns = await db.prepare(`PRAGMA table_info(documents)`).all()
    const columnNames = (columns.results as any[]).map((col: any) => col.name)
    console.log('[migrateDB] Existing columns:', columnNames)

    const migrations: Array<{ name: string, sql: string }> = []

    // 检查并添加 parent_id 列
    if (!columnNames.includes('parent_id')) {
      migrations.push({
        name: 'add_parent_id',
        sql: `ALTER TABLE documents ADD COLUMN parent_id TEXT`
      })
    }

    // 检查并添加 type 列
    if (!columnNames.includes('type')) {
      migrations.push({
        name: 'add_type',
        sql: `ALTER TABLE documents ADD COLUMN type TEXT NOT NULL DEFAULT 'document'`
      })
    }

    // 检查并移除 path 列（如果存在）
    // 注意：SQLite 不支持直接删除列，需要通过重建表的方式
    // 这里我们标记需要迁移，实际迁移在 migrateRemovePath 中处理
    if (columnNames.includes('path')) {
      console.log('[migrateDB] path 列存在，将在下次迁移时移除')
    }

    // 执行迁移
    for (const migration of migrations) {
      try {
        console.log(`[migrateDB] Executing migration: ${migration.name}`)
        await db.prepare(migration.sql).run()
        console.log(`[migrateDB] Migration ${migration.name} completed successfully`)
      } catch (error: any) {
        // 如果列已存在（可能由其他迁移添加），忽略错误
        if (error?.message?.includes('duplicate column') || error?.message?.includes('already exists')) {
          console.log(`[migrateDB] Migration ${migration.name} skipped (column may already exist)`)
        } else {
          console.error(`[migrateDB] Migration ${migration.name} failed:`, error?.message)
          throw error
        }
      }
    }

    // 迁移现有数据：为旧数据添加默认类型
    try {
      const updateResult = await db.prepare(`
        UPDATE documents 
        SET type = CASE 
          WHEN type IS NULL OR type = '' THEN 'document' 
          ELSE type 
        END,
        parent_id = CASE 
          WHEN parent_id IS NULL OR parent_id = '' THEN NULL 
          ELSE parent_id 
        END
        WHERE type IS NULL OR type = ''
      `).run()
      console.log(`[migrateDB] Migrated ${updateResult.meta.changes || 0} existing documents`)
    } catch (migrateError: any) {
      // 迁移失败不影响初始化，可能是新数据库或已迁移
      console.log('[migrateDB] Data migration skipped or failed:', migrateError?.message)
    }

    console.log('[migrateDB] Database migration completed successfully')
  } catch (error: any) {
    console.error('[migrateDB] Database migration failed:', {
      message: error?.message,
      stack: error?.stack,
      error: error
    })
    // 迁移失败不应该阻止应用启动，只记录错误
    console.warn('[migrateDB] Continuing despite migration errors')
  }
}
