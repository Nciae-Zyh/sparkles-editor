import { logAiConfig, logAiError, logAiRequest, logAiSuccess, logAiUpstream, logAiValidationFail } from '~~/server/utils/ai-log'

const ENDPOINT = 'assist'

function buildPrompt(action: string, text: string, context: string, tone: string, targetLang: string) {
  if (action === 'rewrite') {
    return `Rewrite the following text in a ${tone || 'professional and clear'} tone. Preserve the original meaning. Output only the rewritten text without explanations. Detect the language of the input and respond in the same language.\n\nText:\n${text}\n\nContext:\n${context || '(none)'}`
  }
  if (action === 'translate') {
    return `Translate the following text into ${targetLang || 'English'}. Output only the translation.\n\n${text}`
  }
  if (action === 'title') {
    return `Generate 5 concise title suggestions for the following content (output as a numbered list). Detect the language of the input and respond in the same language.\n\n${text}`
  }
  return `Extract action items from the following content using Markdown task list format (- [ ]). Detect the language of the input and respond in the same language.\n\n${text}`
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
