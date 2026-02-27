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
    const prompt = `请对以下选中的内容进行扩写。要求：
1. 保持原文的核心意思和观点不变；
2. 适当展开、补充细节或论据，使内容更丰富、完整；
3. 保持与原文风格、语气一致；
4. 只输出扩写后的完整内容，不要重复原文再扩写，不要加「扩写如下」等前缀。

${context ? `上下文：\n${context}\n\n` : ''}选中内容：\n${selectedText}\n\n请输出扩写后的完整内容：`

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
