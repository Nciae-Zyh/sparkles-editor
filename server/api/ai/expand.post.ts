import { logAiConfig, logAiError, logAiRequest, logAiSuccess, logAiUpstream, logAiValidationFail } from '~~/server/utils/ai-log'

const ENDPOINT = 'expand'

export default eventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const body = await readBody(event).catch((e) => {
    logAiError(ENDPOINT, e, { phase: 'readBody' })
    throw createError({ statusCode: 400, message: 'Invalid request body' })
  })

  const { selectedText, context, maxTokens = 500 } = body

  logAiRequest(ENDPOINT, {
    hasSelectedText: !!selectedText,
    selectedTextLength: typeof selectedText === 'string' ? selectedText.length : 0,
    hasContext: !!context,
    contextLength: typeof context === 'string' ? context.length : 0,
    maxTokens
  })

  if (!selectedText || typeof selectedText !== 'string') {
    logAiValidationFail(ENDPOINT, 'selectedText is required and must be string')
    throw createError({
      statusCode: 400,
      message: 'Selected text is required'
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

  const requestUrl = `${apiUrl}/chat/completions`
  if (!requestUrl.startsWith('http')) {
    logAiError(ENDPOINT, new Error('Invalid xiaomiAiApiUrl'), { apiUrl })
    throw createError({
      statusCode: 500,
      message: 'AI API URL is invalid'
    })
  }

  try {
    const prompt = `Expand the selected text below. Rules:
1. Preserve the core meaning and viewpoint of the original.
2. Add details, examples, or arguments to make it richer and more complete.
3. Match the original style and tone.
4. Output only the expanded content — no prefixes or explanations.
5. Detect the language of the input and respond in the same language.

${context ? `Context:\n${context}\n\n` : ''}Selected text:\n${selectedText}\n\nExpanded version:`

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
        temperature: 0.6
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
    const expandedText = data.choices?.[0]?.message?.content?.trim() || ''

    logAiSuccess(ENDPOINT, { contentLength: expandedText.length })

    return {
      success: true,
      content: expandedText
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    logAiError(ENDPOINT, error, { phase: 'handler' })
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to expand selection'
    })
  }
})
