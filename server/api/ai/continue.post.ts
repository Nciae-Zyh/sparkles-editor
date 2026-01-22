import { getDBWithMigration } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)

  const { content, maxTokens = 500 } = body

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

  try {
    // 调用小米 AI API
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
            content: `请继续完成以下内容，保持风格一致：\n\n${content}`
          }
        ],
        max_tokens: maxTokens,
        temperature: 0.7
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
    const continuedText = data.choices?.[0]?.message?.content || ''

    return {
      success: true,
      content: continuedText
    }
  } catch (error: any) {
    console.error('AI continue error:', error)
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to generate continuation'
    })
  }
})
