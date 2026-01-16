import type { CloudflareEnv } from '../../types'

export function getDB(event: any) {
  const env = event.context.cloudflare?.env as CloudflareEnv
  return env?.DB
}

/**
 * Get database and ensure migration is completed
 */
export async function getDBWithMigration(event: any): Promise<D1Database> {
  const db = getDB(event)
  if (!db) {
    throw new Error('Database not available')
  }

  // Perform migration check (non-blocking, failure doesn't affect main flow)
  try {
    await migrateDB(db)
  } catch (error: any) {
    console.warn('[getDBWithMigration] Migration check failed:', error?.message)
    // Migration failure should not block API calls, only log warning
  }

  return db
}

export async function initDB(db: D1Database) {
  try {
    console.log('[initDB] Starting database initialization')

    // Create users table - use prepare().run() instead of exec()
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

    // Create documents table (supports directory structure)
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
    } catch (error: any) {
      console.error('[initDB] Failed to create documents table:', error)
      throw new Error(`Failed to create documents table: ${error?.message || 'Unknown error'}`)
    }

    // Database migration: check and add missing columns
    await migrateDB(db)

    // Create indexes - execute each index creation statement separately
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
        // Index creation failure should not block initialization, only log error
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
 * Database migration: check and add missing columns
 */
export async function migrateDB(db: D1Database) {
  try {
    console.log('[migrateDB] Starting database migration')

    // Check if table exists
    const tableInfo = await db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='documents'
    `).first()

    if (!tableInfo) {
      console.log('[migrateDB] Documents table does not exist, skipping migration')
      return
    }

    // Get existing column information
    const columns = await db.prepare(`PRAGMA table_info(documents)`).all()
    const columnNames = (columns.results as any[]).map((col: any) => col.name)
    console.log('[migrateDB] Existing columns:', columnNames)

    const migrations: Array<{ name: string, sql: string }> = []

    // Check and add parent_id column
    if (!columnNames.includes('parent_id')) {
      migrations.push({
        name: 'add_parent_id',
        sql: `ALTER TABLE documents ADD COLUMN parent_id TEXT`
      })
    }

    // Check and add path column
    if (!columnNames.includes('path')) {
      migrations.push({
        name: 'add_path',
        sql: `ALTER TABLE documents ADD COLUMN path TEXT NOT NULL DEFAULT ''`
      })
    }

    // Check and add type column
    if (!columnNames.includes('type')) {
      migrations.push({
        name: 'add_type',
        sql: `ALTER TABLE documents ADD COLUMN type TEXT NOT NULL DEFAULT 'document'`
      })
    }

    // Execute migrations
    for (const migration of migrations) {
      try {
        console.log(`[migrateDB] Executing migration: ${migration.name}`)
        await db.prepare(migration.sql).run()
        console.log(`[migrateDB] Migration ${migration.name} completed successfully`)
      } catch (error: any) {
        // If column already exists (may have been added by another migration), ignore error
        if (error?.message?.includes('duplicate column') || error?.message?.includes('already exists')) {
          console.log(`[migrateDB] Migration ${migration.name} skipped (column may already exist)`)
        } else {
          console.error(`[migrateDB] Migration ${migration.name} failed:`, error?.message)
          throw error
        }
      }
    }

    // Migrate existing data: add default path and type for old data
    try {
      const updateResult = await db.prepare(`
        UPDATE documents 
        SET path = CASE 
          WHEN path IS NULL OR path = '' THEN '/' || id 
          ELSE path 
        END,
        type = CASE 
          WHEN type IS NULL OR type = '' THEN 'document' 
          ELSE type 
        END,
        parent_id = CASE 
          WHEN parent_id IS NULL OR parent_id = '' THEN NULL 
          ELSE parent_id 
        END
        WHERE path IS NULL OR path = '' OR type IS NULL OR type = ''
      `).run()
      console.log(`[migrateDB] Migrated ${updateResult.meta.changes || 0} existing documents`)
    } catch (migrateError: any) {
      // Migration failure doesn't affect initialization, may be new database or already migrated
      console.log('[migrateDB] Data migration skipped or failed:', migrateError?.message)
    }

    console.log('[migrateDB] Database migration completed successfully')
  } catch (error: any) {
    console.error('[migrateDB] Database migration failed:', {
      message: error?.message,
      stack: error?.stack,
      error: error
    })
    // Migration failure should not block application startup, only log error
    console.warn('[migrateDB] Continuing despite migration errors')
  }
}
