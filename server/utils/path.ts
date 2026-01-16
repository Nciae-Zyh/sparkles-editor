import { generateDocumentId } from './auth'
import type { CloudflareEnv } from '../../types'

/**
 * Parse WebStorm-like file name, extract folder path and file name
 * Example: "folder/subfolder/file.md" -> { folderPath: ["folder", "subfolder"], fileName: "file.md" }
 */
export function parseFilePath(filePath: string): { folderPath: string[], fileName: string } {
  // 移除开头的斜杠
  const normalized = filePath.replace(/^\/+/, '')

  // 分割路径
  const parts = normalized.split('/').filter(Boolean)

  if (parts.length === 0) {
    return { folderPath: [], fileName: '' }
  }

  if (parts.length === 1) {
    return { folderPath: [], fileName: parts[0] }
  }

  // 最后一部分是文件名，其余是文件夹路径
  const fileName = parts[parts.length - 1]
  const folderPath = parts.slice(0, -1)

  return { folderPath, fileName }
}

/**
 * Ensure folder path exists, create if it doesn't exist
 * Returns the final parent folder ID
 */
export async function ensureFolderPath(
  db: D1Database,
  userId: string,
  folderPath: string[],
  baseParentId: string | null = null
): Promise<string | null> {
  if (folderPath.length === 0) {
    return baseParentId
  }

  let currentParentId = baseParentId
  const now = Math.floor(Date.now() / 1000)

  for (let i = 0; i < folderPath.length; i++) {
    const folderName = folderPath[i]

    // Get current parent folder path
    let currentPath = '/'
    if (currentParentId) {
      const parent = await db.prepare('SELECT path FROM documents WHERE id = ? AND user_id = ?')
        .bind(currentParentId, userId)
        .first() as any

      if (parent) {
        currentPath = parent.path
      }
    }

    // Build new folder path (using folder ID, not name)
    // First check if folder with same name already exists
    const existingFolder = await db.prepare(`
      SELECT id, path FROM documents 
      WHERE user_id = ? AND parent_id = ? AND title = ? AND type = 'folder'
    `).bind(
      userId,
      currentParentId || null,
      folderName
    ).first() as any

    if (existingFolder) {
      // Folder already exists, use its ID
      currentParentId = existingFolder.id
      console.log(`[ensureFolderPath] Folder exists: ${folderName}, id=${existingFolder.id}, path=${existingFolder.path}`)
    } else {
      // Create new folder
      const folderId = generateDocumentId()
      // Path format: /parentPath/folderId or /folderId (if root directory)
      const newPath = currentPath === '/' ? `/${folderId}` : `${currentPath}/${folderId}`

      try {
        await db.prepare(`
          INSERT INTO documents (id, user_id, title, r2_key, parent_id, path, type, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          folderId,
          userId,
          folderName,
          '', // Folders don't need R2 key
          currentParentId,
          newPath,
          'folder',
          now,
          now
        ).run()

        currentParentId = folderId
        console.log(`[ensureFolderPath] Created folder: ${folderName}, id=${folderId}, path=${newPath}`)
      } catch (error: any) {
        console.error(`[ensureFolderPath] Failed to create folder: ${folderName}`, {
          message: error?.message,
          stack: error?.stack
        })
        throw new Error(`Failed to create folder "${folderName}": ${error?.message || 'Unknown error'}`)
      }
    }
  }

  return currentParentId
}
