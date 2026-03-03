import { logAiConfig, logAiError, logAiRequest, logAiValidationFail } from '~~/server/utils/ai-log'

const ENDPOINT = 'stream'

function buildPrompt(action: string, content: string, currentParagraph?: string, context?: string) {
  if (action === 'continue') {
    if (currentParagraph && currentParagraph.trim()) {
      return `Continue the current paragraph naturally based on the context below. Match the original style, tone, and topic. The continuation should flow seamlessly from the current paragraph without repeating existing content. Detect the language of the input and respond in the same language.

Context:
${context || content}

Current paragraph:
${currentParagraph}

Continue the paragraph:`
    }
    return `Write a natural continuation based on the context below. Match the original style, tone, and topic. The new content should flow coherently from the context. Detect the language of the input and respond in the same language.

Context:
${content}

Continue:`
  }
  return content
}

export default eventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const body = await readBody(event).catch((e) => {
    logAiError(ENDPOINT, e, { phase: 'readBody' })
    throw createError({ statusCode: 400, message: 'Invalid request body' })
  })

  const { action = 'continue', content, currentParagraph, context, maxTokens = 500 } = body

  logAiRequest(ENDPOINT, {
    action,
    hasContent: !!content,
    contentLength: typeof content === 'string' ? content.length : 0,
    maxTokens
  })

  if (!content || typeof content !== 'string') {
    logAiValidationFail(ENDPOINT, 'content is required and must be string')
    throw createError({ statusCode: 400, message: 'Content is required' })
  }

  const apiUrl = (config.xiaomiAiApiUrl as string) || ''
  const apiKey = (config.xiaomiAiApiKey as string) || ''
  const hasApiKey = !!apiKey.trim()
  logAiConfig(ENDPOINT, { hasApiKey, apiUrl })

  if (!hasApiKey) {
    throw createError({ statusCode: 500, message: 'AI API key is not configured' })
  }

  const requestUrl = `${apiUrl}/chat/completions`
  if (!requestUrl.startsWith('http')) {
    throw createError({ statusCode: 500, message: 'AI API URL is invalid' })
  }

  const prompt = buildPrompt(action, content, currentParagraph, context)

  // Set SSE headers
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  })

  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'mimo-v2-flash',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.7,
      stream: true
    })
  })

  if (!response.ok) {
    const errText = await response.text()
    logAiError(ENDPOINT, new Error(errText), { phase: 'upstream', status: response.status })
    throw createError({ statusCode: response.status, message: 'AI API request failed' })
  }

  if (!response.body) {
    throw createError({ statusCode: 500, message: 'No response body from AI API' })
  }

  // Forward the SSE stream to the client
  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  return sendStream(event, new ReadableStream({
    async pull(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
            controller.close()
            break
          }

          const chunk = decoder.decode(value, { stream: true })
          // Forward the SSE lines from the upstream
          const lines = chunk.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') {
                controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
                controller.close()
                return
              }
              try {
                const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> }
                const textChunk = parsed.choices?.[0]?.delta?.content
                if (textChunk) {
                  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ text: textChunk })}\n\n`))
                }
              } catch (_) {
                // Skip malformed lines
              }
            }
          }
        }
      } catch (err) {
        logAiError(ENDPOINT, err, { phase: 'stream' })
        controller.close()
      }
    },
    cancel() {
      reader.cancel()
    }
  }))
})
