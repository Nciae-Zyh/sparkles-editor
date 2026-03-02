import { logAiConfig, logAiError, logAiRequest, logAiSuccess, logAiUpstream, logAiValidationFail } from '~~/server/utils/ai-log'

const ENDPOINT = 'assist'

function buildPrompt(action: string, text: string, context: string, tone: string, targetLang: string) {
  if (action === 'rewrite') {
    return `请把下面的内容改写成${tone || '专业、清晰'}语气，保持原意，不要额外解释：\n\n${text}\n\n上下文：\n${context || '(none)'}`
  }
  if (action === 'translate') {
    return `请把下面内容翻译为${targetLang || '英文'}，只输出翻译结果：\n\n${text}`
  }
  if (action === 'title') {
    return `请为下面内容生成 5 个简洁标题（列表形式）：\n\n${text}`
  }
  return `请从下面内容中提炼行动项，使用 Markdown 任务列表格式（- [ ]）：\n\n${text}`
}

export default eventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const body = await readBody(event).catch((e) => {
    logAiError(ENDPOINT, e, { phase: 'readBody' })
    throw createError({ statusCode: 400, message: 'Invalid request body' })
  })

  const action = String(body?.action || '').trim()
  const text = String(body?.text || '').trim()
  const context = String(body?.context || '')
  const tone = String(body?.tone || '')
  const targetLang = String(body?.targetLang || '')
  const maxTokens = Number(body?.maxTokens || 600)

  logAiRequest(ENDPOINT, {
    action,
    textLength: text.length,
    contextLength: context.length,
    tone,
    targetLang,
    maxTokens
  })

  if (!text) {
    logAiValidationFail(ENDPOINT, 'text is required')
    throw createError({ statusCode: 400, message: 'Text is required' })
  }

  const allowedActions = new Set(['rewrite', 'translate', 'title', 'action_items'])
  if (!allowedActions.has(action)) {
    logAiValidationFail(ENDPOINT, `unsupported action: ${action}`)
    throw createError({ statusCode: 400, message: 'Unsupported action' })
  }

  const apiUrl = (config.xiaomiAiApiUrl as string) || ''
  const hasApiKey = !!(config.xiaomiAiApiKey as string)?.trim()
  logAiConfig(ENDPOINT, { hasApiKey, apiUrl })
  if (!hasApiKey) {
    throw createError({ statusCode: 500, message: 'AI API key is not configured' })
  }

  const requestUrl = `${apiUrl}/chat/completions`
  const prompt = buildPrompt(action, text, context, tone, targetLang)

  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.xiaomiAiApiKey}`
      },
      body: JSON.stringify({
        model: 'mimo-v2-flash',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0.5
      })
    })

    const rawBody = await response.text()
    logAiUpstream(ENDPOINT, requestUrl, response.status, rawBody.slice(0, 200))
    if (!response.ok) {
      throw createError({ statusCode: response.status, message: 'AI API request failed' })
    }

    const data = JSON.parse(rawBody) as { choices?: Array<{ message?: { content?: string } }> }
    const result = data.choices?.[0]?.message?.content?.trim() || ''
    logAiSuccess(ENDPOINT, { contentLength: result.length })
    return { success: true, content: result }
  } catch (error: any) {
    if (error.statusCode) throw error
    logAiError(ENDPOINT, error, { phase: 'handler' })
    throw createError({ statusCode: 500, message: error?.message || 'Failed to process AI action' })
  }
})
