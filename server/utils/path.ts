import { generateDocumentId } from './auth'
import type { CloudflareEnv } from '../../types'

/**
 * 解析类似 WebStorm 的文件名，提取文件夹路径和文件名
 * 例如: "folder/subfolder/file.md" -> { folderPath: ["folder", "subfolder"], fileName: "file.md" }
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
 * 确保文件夹路径存在，如果不存在则创建
 * 返回最终的父文件夹 ID
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

    // 获取当前父文件夹的路径
    let currentPath = '/'
    if (currentParentId) {
      const parent = await db.prepare('SELECT path FROM documents WHERE id = ? AND user_id = ?')
        .bind(currentParentId, userId)
        .first() as any

      if (parent) {
        currentPath = parent.path
      }
    }

    // 构建新文件夹的路径（使用文件夹ID，而不是名称）
    // 先检查是否已存在同名文件夹
    const existingFolder = await db.prepare(`
      SELECT id, path FROM documents 
      WHERE user_id = ? AND parent_id = ? AND title = ? AND type = 'folder'
    `).bind(
      userId,
      currentParentId || null,
      folderName
    ).first() as any

    if (existingFolder) {
      // 文件夹已存在，使用它的 ID
      currentParentId = existingFolder.id
      console.log(`[ensureFolderPath] Folder exists: ${folderName}, id=${existingFolder.id}, path=${existingFolder.path}`)
    } else {
      // 创建新文件夹
      const folderId = generateDocumentId()
      // 路径格式：/parentPath/folderId 或 /folderId（如果是根目录）
      const newPath = currentPath === '/' ? `/${folderId}` : `${currentPath}/${folderId}`

      try {
        await db.prepare(`
          INSERT INTO documents (id, user_id, title, r2_key, parent_id, path, type, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          folderId,
          userId,
          folderName,
          '', // 文件夹不需要 R2 key
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
