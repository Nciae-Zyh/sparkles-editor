import type { CloudflareEnv } from '../../types'

export function getR2Bucket(event: any): R2Bucket | null {
  const env = event.context.cloudflare?.env as CloudflareEnv
  return env?.BLOB || null
}

/**
 * 将 R2 key 转换为 Nitro storage key（本地开发用）
 * R2 key: documents/userId/docId.md  →  storage key: docs:documents:userId:docId.md
 */
function toStorageKey(r2Key: string): string {
  return `docs:${r2Key.replace(/\//g, ':')}`
}

export async function saveDocumentToR2(
  r2: R2Bucket | null,
  userId: string,
  documentId: string,
  content: string
): Promise<string> {
  const key = `documents/${userId}/${documentId}.md`

  if (r2) {
    // 生产环境：使用 Cloudflare R2
    try {
      console.log(`[saveDocumentToR2] 保存文档到R2: key=${key}, contentLength=${content.length}`)
      await r2.put(key, content, {
        httpMetadata: {
          contentType: 'text/markdown'
        }
      })
      console.log(`[saveDocumentToR2] R2保存成功: key=${key}`)
      return key
    } catch (error: any) {
      console.error(`[saveDocumentToR2] R2保存失败:`, { key, message: error?.message })
      throw new Error(`Failed to save document to R2: ${error?.message || 'Unknown error'}`)
    }
  } else {
    // 本地开发：使用 Nitro storage（文件系统）
    const storageKey = toStorageKey(key)
    await useStorage('data').setItem(storageKey, content)
    console.log(`[saveDocumentToR2] 本地存储保存成功: key=${key}`)
    return key
  }
}

export async function getDocumentFromR2(r2: R2Bucket | null, key: string): Promise<string | null> {
  if (!key) return null

  if (r2) {
    const object = await r2.get(key)
    if (!object) return null
    return await object.text()
  } else {
    // 本地开发：从 Nitro storage 读取
    const storageKey = toStorageKey(key)
    return await useStorage('data').getItem<string>(storageKey)
  }
}

export async function deleteDocumentFromR2(r2: R2Bucket | null, key: string): Promise<void> {
  if (!key) return

  if (r2) {
    await r2.delete(key)
  } else {
    // 本地开发：从 Nitro storage 删除
    const storageKey = toStorageKey(key)
    await useStorage('data').removeItem(storageKey)
  }
}
