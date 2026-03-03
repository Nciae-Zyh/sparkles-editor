declare global {
  interface D1ResultMeta {
    changes?: number
    last_row_id?: number | string
  }

  interface D1Result<T = unknown> {
    success: boolean
    meta: D1ResultMeta
    results?: T[]
  }

  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement
    first<T = unknown>(): Promise<T | null>
    all<T = unknown>(): Promise<D1Result<T>>
    run(): Promise<D1Result>
  }

  interface D1Database {
    prepare(query: string): D1PreparedStatement
  }

  interface R2Bucket {
    get(
      key: string
    ): Promise<{ text(): Promise<string>, arrayBuffer(): Promise<ArrayBuffer> } | null>
    put(
      key: string,
      value: string | ArrayBuffer | ArrayBufferView | ReadableStream | Blob,
      options?: {
        httpMetadata?: {
          contentType?: string
        }
      }
    ): Promise<void>
    delete(key: string): Promise<void>
  }

  const process: {
    env: Record<string, string | undefined>
    argv: string[]
    cwd(): string
  }
}

declare module 'better-sqlite3' {
  interface DatabaseStatement {
    run(...params: unknown[]): { changes: number, lastInsertRowid: number | bigint }
    get(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
  }

  export default class Database {
    constructor(path: string)
    prepare(sql: string): DatabaseStatement
  }
}

declare module 'node:fs' {
  export function mkdirSync(
    path: string,
    options?: {
      recursive?: boolean
    }
  ): void
}
