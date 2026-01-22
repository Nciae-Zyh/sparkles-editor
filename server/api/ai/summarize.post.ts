import { getDBWithMigration } from '~~/server/utils/db'

// 使用 Web Crypto API 生成 SHA-256 哈希
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export default eventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)

  const { content, shareId } = body

  if (!content || typeof content !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'Content is required'
    })
  }

  if (!config.xiaomiAiApiKey) {
    throw createError({
      statusCode: 500,
      message: 'AI API key is not configured'
    })
  }

  // 生成内容哈希用于缓存
  const contentHash = await sha256(content)

  try {
    const db = await getDBWithMigration(event)

    // 如果有 shareId，检查缓存
    if (shareId) {
      const cached = await db.prepare(`
        SELECT summary, content_hash
        FROM share_summaries
        WHERE share_id = ? AND content_hash = ?
      `).bind(shareId, contentHash).first<{
        summary: string
        content_hash: string
      }>()

      if (cached) {
        return {
          success: true,
          content: cached.summary,
          cached: true
        }
      }
    }

    // 调用小米 AI API 生成总结
    const response = await fetch(`${config.xiaomiAiApiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.xiaomiAiApiKey}`
      },
      body: JSON.stringify({
        model: 'mimo-v2-flash',
        messages: [
          {
            role: 'user',
            content: `请为以下内容生成一个简洁的总结，不超过200字：\n\n${content}`
          }
        ],
        max_tokens: 300,
        temperature: 0.5
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw createError({
        statusCode: response.status,
        message: errorData.error?.message || 'AI API request failed'
      })
    }

    const data = await response.json()
    const summary = data.choices?.[0]?.message?.content || ''

    // 如果有 shareId，保存到缓存
    if (shareId && summary) {
      try {
        // 确保表存在
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS share_summaries (
            id TEXT PRIMARY KEY,
            share_id TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            summary TEXT NOT NULL,
            created_at INTEGER NOT NULL DEFAULT (unixepoch()),
            FOREIGN KEY (share_id) REFERENCES shares(id) ON DELETE CASCADE
          )
        `).run()

        // 创建索引
        await db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_share_summaries_share_id
          ON share_summaries(share_id)
        `).run().catch(() => {})

        await db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_share_summaries_content_hash
          ON share_summaries(content_hash)
        `).run().catch(() => {})

        // 插入或更新缓存
        const summaryId = `${shareId}-${contentHash}`
        await db.prepare(`
          INSERT OR REPLACE INTO share_summaries (id, share_id, content_hash, summary)
          VALUES (?, ?, ?, ?)
        `).bind(summaryId, shareId, contentHash, summary).run()
      } catch (cacheError: any) {
        // 缓存失败不影响返回结果
        console.warn('Failed to cache summary:', cacheError)
      }
    }

    return {
      success: true,
      content: summary,
      cached: false
    }
  } catch (error: any) {
    console.error('AI summarize error:', error)
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to generate summary'
    })
  }
})
