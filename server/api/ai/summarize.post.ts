import { getDBWithMigration } from '~~/server/utils/db'
import { logAiConfig, logAiError, logAiRequest, logAiSuccess, logAiUpstream, logAiValidationFail } from '~~/server/utils/ai-log'

const ENDPOINT = 'summarize'

// 使用 Web Crypto API 生成 SHA-256 哈希
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export default eventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const body = await readBody(event).catch((e) => {
    logAiError(ENDPOINT, e, { phase: 'readBody' })
    throw createError({ statusCode: 400, message: 'Invalid request body' })
  })

  const { content, shareId } = body

  logAiRequest(ENDPOINT, {
    hasContent: !!content,
    contentLength: typeof content === 'string' ? content.length : 0,
    shareId: shareId ?? '(none)'
  })

  if (!content || typeof content !== 'string') {
    logAiValidationFail(ENDPOINT, 'content is required and must be string')
    throw createError({
      statusCode: 400,
      message: 'Content is required'
    })
  }

  const apiUrl = (config.xiaomiAiApiUrl as string) || ''
  const hasApiKey = !!(config.xiaomiAiApiKey as string)?.trim()
  logAiConfig(ENDPOINT, { hasApiKey, apiUrl })

  if (!hasApiKey) {
    logAiError(ENDPOINT, new Error('AI API key is not configured'), { phase: 'config' })
    throw createError({
      statusCode: 500,
      message: 'AI API key is not configured'
    })
  }

  const contentHash = await sha256(content)

  try {
    const db = await getDBWithMigration(event)

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
        logAiSuccess(ENDPOINT, { contentLength: cached.summary.length, cached: true })
        return {
          success: true,
          content: cached.summary,
          cached: true
        }
      }
    }

    const requestUrl = `${apiUrl}/chat/completions`
    if (!requestUrl.startsWith('http')) {
      logAiError(ENDPOINT, new Error('Invalid xiaomiAiApiUrl'), { apiUrl })
      throw createError({
        statusCode: 500,
        message: 'AI API URL is invalid'
      })
    }

    const response = await fetch(requestUrl, {
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
            content: `Write a concise summary of the following content in under 150 words. Detect the language of the input and respond in the same language.\n\n${content}`
          }
        ],
        max_tokens: 300,
        temperature: 0.5
      })
    })

    const rawBody = await response.text()
    logAiUpstream(ENDPOINT, requestUrl, response.status, rawBody.slice(0, 200))

    if (!response.ok) {
      let errorMessage = 'AI API request failed'
      try {
        const errorData = JSON.parse(rawBody)
        errorMessage = errorData?.error?.message || errorMessage
        logAiError(ENDPOINT, new Error(errorMessage), {
          phase: 'upstream',
          status: response.status,
          errorData: errorData?.error ?? errorData
        })
      } catch (_) {
        logAiError(ENDPOINT, new Error(rawBody || String(response.status)), { phase: 'upstream', status: response.status })
      }
      throw createError({
        statusCode: response.status,
        message: errorMessage
      })
    }

    const data = JSON.parse(rawBody) as { choices?: Array<{ message?: { content?: string } }> }
    const summary = data.choices?.[0]?.message?.content || ''

    if (shareId && summary) {
      try {
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

        await db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_share_summaries_share_id
          ON share_summaries(share_id)
        `).run().catch(() => {})

        await db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_share_summaries_content_hash
          ON share_summaries(content_hash)
        `).run().catch(() => {})

        const summaryId = `${shareId}-${contentHash}`
        await db.prepare(`
          INSERT OR REPLACE INTO share_summaries (id, share_id, content_hash, summary)
          VALUES (?, ?, ?, ?)
        `).bind(summaryId, shareId, contentHash, summary).run()
      } catch (cacheError: any) {
        console.warn('[AI] summarize cache write failed', cacheError?.message ?? cacheError)
      }
    }

    logAiSuccess(ENDPOINT, { contentLength: summary.length, cached: false })

    return {
      success: true,
      content: summary,
      cached: false
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    logAiError(ENDPOINT, error, { phase: 'handler' })
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to generate summary'
    })
  }
})
