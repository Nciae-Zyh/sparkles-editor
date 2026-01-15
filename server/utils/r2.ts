import type { CloudflareEnv } from '../../types'

export function getR2Bucket(event: any): R2Bucket | null {
  const env = event.context.cloudflare?.env as CloudflareEnv
  return env?.BLOB || null
}

export async function saveDocumentToR2(
  r2: R2Bucket,
  userId: string,
  documentId: string,
  content: string
): Promise<string> {
  const key = `documents/${userId}/${documentId}.md`
  
  try {
    console.log(`[saveDocumentToR2] 开始保存文档到R2: key=${key}, contentLength=${content.length}`)
    
    await r2.put(key, content, {
      httpMetadata: {
        contentType: 'text/markdown'
      }
    })
    
    console.log(`[saveDocumentToR2] R2保存成功: key=${key}`)
    return key
  } catch (error: any) {
    console.error(`[saveDocumentToR2] R2保存失败:`, {
      key,
      userId,
      documentId,
      contentLength: content.length,
      message: error?.message,
      stack: error?.stack,
      error: error
    })
    throw new Error(`Failed to save document to R2: ${error?.message || 'Unknown error'}`)
  }
}

export async function getDocumentFromR2(r2: R2Bucket, key: string): Promise<string | null> {
  const object = await r2.get(key)
  if (!object) {
    return null
  }
  return await object.text()
}

export async function deleteDocumentFromR2(r2: R2Bucket, key: string): Promise<void> {
  await r2.delete(key)
}
