import { getDBWithMigration } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)

  const { content, context, currentParagraph, maxTokens = 500 } = body

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
    // 构建更智能的 prompt
    let prompt = ''
    
    if (currentParagraph && currentParagraph.trim()) {
      // 如果有当前段落，续写当前段落
      prompt = `请根据以下上下文，自然地续写当前段落。保持与原文风格、语气和主题一致，续写内容应该流畅地接续当前段落，不要重复已有内容。

上下文：
${context || ''}

当前段落：
${currentParagraph}

请续写当前段落：`
    } else {
      // 如果没有当前段落，根据上下文续写新内容
      prompt = `请根据以下上下文，自然地续写一段新内容。保持与原文风格、语气和主题一致，内容应该与上下文连贯。

上下文：
${content}

请续写新内容：`
    }

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
            content: prompt
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
