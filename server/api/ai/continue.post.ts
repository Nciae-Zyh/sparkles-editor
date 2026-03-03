import { logAiConfig, logAiError, logAiRequest, logAiSuccess, logAiUpstream, logAiValidationFail } from '~~/server/utils/ai-log'

const ENDPOINT = 'continue'

export default eventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const body = await readBody(event).catch((e) => {
    logAiError(ENDPOINT, e, { phase: 'readBody' })
    throw createError({ statusCode: 400, message: 'Invalid request body' })
  })

  const { content, context, currentParagraph, maxTokens = 500 } = body

  logAiRequest(ENDPOINT, {
    hasContent: !!content,
    contentType: typeof content,
    contentLength: typeof content === 'string' ? content.length : 0,
    hasContext: !!context,
    hasCurrentParagraph: !!currentParagraph,
    currentParagraphLength: typeof currentParagraph === 'string' ? currentParagraph.length : 0,
    maxTokens
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

  const requestUrl = `${apiUrl}/chat/completions`
  if (!requestUrl.startsWith('http')) {
    logAiError(ENDPOINT, new Error('Invalid xiaomiAiApiUrl'), { apiUrl })
    throw createError({
      statusCode: 500,
      message: 'AI API URL is invalid'
    })
  }

  try {
    let prompt = ''
    if (currentParagraph && currentParagraph.trim()) {
      prompt = `Continue the current paragraph naturally based on the context below. Match the original style, tone, and topic. The continuation should flow seamlessly from the current paragraph without repeating existing content. Detect the language of the input and respond in the same language.

Context:
${context || ''}

Current paragraph:
${currentParagraph}

Continue the paragraph:`
    } else {
      prompt = `Write a natural continuation based on the context below. Match the original style, tone, and topic. The new content should flow coherently from the context. Detect the language of the input and respond in the same language.

Context:
${content}

Continue:`
    }

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
        temperature: 0.7
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
    const continuedText = data.choices?.[0]?.message?.content || ''

    logAiSuccess(ENDPOINT, { contentLength: continuedText.length })

    return {
      success: true,
      content: continuedText
    }
  } catch (error: any) {
    if (error.statusCode) {
      throw error
    }
    logAiError(ENDPOINT, error, { phase: 'handler' })
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to generate continuation'
    })
  }
})
