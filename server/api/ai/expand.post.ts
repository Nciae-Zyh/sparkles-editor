export default eventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)

  const { selectedText, context, maxTokens = 500 } = body

  if (!selectedText || typeof selectedText !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'Selected text is required'
    })
  }

  if (!config.xiaomiAiApiKey) {
    throw createError({
      statusCode: 500,
      message: 'AI API key is not configured'
    })
  }

  try {
    const prompt = `请对以下选中的内容进行扩写。要求：
1. 保持原文的核心意思和观点不变；
2. 适当展开、补充细节或论据，使内容更丰富、完整；
3. 保持与原文风格、语气一致；
4. 只输出扩写后的完整内容，不要重复原文再扩写，不要加「扩写如下」等前缀。

${context ? `上下文：\n${context}\n\n` : ''}选中内容：\n${selectedText}\n\n请输出扩写后的完整内容：`

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
        temperature: 0.6
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
    const expandedText = data.choices?.[0]?.message?.content?.trim() || ''

    return {
      success: true,
      content: expandedText
    }
  } catch (error: any) {
    console.error('AI expand error:', error)
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to expand selection'
    })
  }
})
