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
  await r2.put(key, content, {
    httpMetadata: {
      contentType: 'text/markdown'
    }
  })
  return key
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
