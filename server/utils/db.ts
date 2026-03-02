import type { CloudflareEnv } from '../../types'

// 模块级缓存：同一进程内只执行一次迁移
const _migrationDone = new Set<string>()

// 本地 SQLite 实例缓存（仅开发环境使用）
let _localDb: D1Database | null = null

/**
 * 原始方式：从 Cloudflare 环境获取 D1 绑定
 * 保持与原始代码的向后兼容性
 */
export function getDB(event: any): D1Database | undefined {
  const env = event?.context?.cloudflare?.env as CloudflareEnv
  return env?.DB
}

/**
 * 将 better-sqlite3 实例封装成 D1 兼容接口（仅本地开发）
 * 生产环境构建时，import.meta.dev === false，此函数被 Rollup tree-shaking 完全移除
 */
async function createLocalD1(): Promise<D1Database> {
  if (_localDb) return _localDb

  // 使用动态 import() 替代 require()，兼容 ESM 上下文
  // 此代码块受 import.meta.dev 保护，生产环境 Rollup 会移除
  const { mkdirSync } = await import('node:fs')
  const { default: Database } = await import('better-sqlite3')

  mkdirSync('.data', { recursive: true })
  const sqlite = new Database('.data/local.sqlite')

  // 构建 D1 兼容的 prepare().bind().first()/all()/run() 接口
  const makeStmt = (sql: string, params: unknown[] = []) => ({
    bind: (...p: unknown[]) => makeStmt(sql, p),
    async first() {
      return (sqlite.prepare(sql).get(...params) ?? null) as any
    },
    async all() {
      return { results: sqlite.prepare(sql).all(...params), success: true, meta: {} } as any
    },
    async run() {
      const r = sqlite.prepare(sql).run(...params)
      return { success: true, meta: { changes: r.changes, last_row_id: r.lastInsertRowid } } as any
    }
  })

  _localDb = { prepare: (sql: string) => makeStmt(sql) as any } as D1Database
  return _localDb
}

/**
 * 获取数据库并确保迁移已完成
 * - 优先使用 Cloudflare D1 绑定（生产环境）
 * - 若无 D1 绑定（本地开发），自动回退到本地 SQLite
 */
export async function getDBWithMigration(event?: any): Promise<D1Database> {
  // 1. 优先使用 D1 绑定
  const d1 = getDB(event)
  let db: D1Database | null = d1 ?? null

  // 2. 本地开发回退：使用 better-sqlite3
  if (!db) {
    if (import.meta.dev) {
      db = await createLocalD1()
    } else {
      throw createError({ statusCode: 500, message: 'Database not available' })
    }
  }

  // 3. 确保每个进程只初始化/迁移一次
  if (!_migrationDone.has('default')) {
    try {
      await initDB(db)  // initDB 内部已包含 migrateDB，会创建表并补齐缺失列
      _migrationDone.add('default')
    } catch (error: any) {
      console.warn('[getDBWithMigration] DB init failed:', error?.message)
    }
  }

  return db
}

export async function initDB(db: D1Database) {
  try {
    console.log('[initDB] Starting database initialization')

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

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS shares (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        password_hash TEXT,
        expires_at INTEGER,
        view_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `).run()

    await migrateDB(db)

    for (const sql of [
      'CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_documents_parent_id ON documents(parent_id)',
      'CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type)',
      'CREATE INDEX IF NOT EXISTS idx_documents_user_parent ON documents(user_id, parent_id)',
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
      'CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id)',
      'CREATE INDEX IF NOT EXISTS idx_shares_document_id ON shares(document_id)',
      'CREATE INDEX IF NOT EXISTS idx_shares_user_id ON shares(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_shares_created_at ON shares(created_at DESC)'
    ]) {
      await db.prepare(sql).run().catch((e: any) =>
        console.warn('[initDB] Index skipped:', e?.message)
      )
    }

    console.log('[initDB] Database initialization completed')
  } catch (error: any) {
    console.error('[initDB] Failed:', error?.message)
    throw error
  }
}

/**
 * 数据库迁移：检查并添加缺失的列
 */
export async function migrateDB(db: D1Database) {
  try {
    const tableInfo = await db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='documents'`
    ).first()

    if (!tableInfo) return

    const columns = await db.prepare(`PRAGMA table_info(documents)`).all()
    const columnNames = (columns.results as any[]).map((col: any) => col.name)

    const migrations: Array<{ name: string, sql: string }> = []
    if (!columnNames.includes('parent_id')) {
      migrations.push({ name: 'add_parent_id', sql: `ALTER TABLE documents ADD COLUMN parent_id TEXT` })
    }
    if (!columnNames.includes('type')) {
      migrations.push({
        name: 'add_type',
        sql: `ALTER TABLE documents ADD COLUMN type TEXT NOT NULL DEFAULT 'document'`
      })
    }

    // 检查并创建 shares 表
    const sharesExists = await db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='shares'`
    ).first()

    if (!sharesExists) {
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS shares (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          password_hash TEXT,
          expires_at INTEGER,
          view_count INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
          FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `).run()
    }

    for (const migration of migrations) {
      await db.prepare(migration.sql).run().catch((e: any) => {
        if (!e?.message?.includes('duplicate column') && !e?.message?.includes('already exists')) {
          throw e
        }
      })
    }

    // 修复旧数据
    await db.prepare(
      `UPDATE documents SET type = 'document' WHERE type IS NULL OR type = ''`
    ).run().catch(() => {})

    console.log('[migrateDB] Migration completed')
  } catch (error: any) {
    console.warn('[migrateDB] Migration error (non-fatal):', error?.message)
  }
}
