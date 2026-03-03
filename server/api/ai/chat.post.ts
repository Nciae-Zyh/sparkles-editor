import { logAiConfig, logAiError, logAiRequest, logAiValidationFail } from '~~/server/utils/ai-log'

const ENDPOINT = 'chat'

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export default eventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const body = await readBody(event).catch((e) => {
    logAiError(ENDPOINT, e, { phase: 'readBody' })
    throw createError({ statusCode: 400, message: 'Invalid request body' })
  })

  const { messages, documentContent } = body as {
    messages: ChatMessage[]
    documentContent?: string
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    logAiValidationFail(ENDPOINT, 'messages array is required')
    throw createError({ statusCode: 400, message: 'Messages are required' })
  }

  logAiRequest(ENDPOINT, {
    messageCount: messages.length,
    hasDocumentContent: !!documentContent,
    documentContentLength: documentContent?.length ?? 0
  })

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

  const systemMessages: ChatMessage[] = []
  if (documentContent) {
    systemMessages.push({
      role: 'system',
      content: `You are a professional writing assistant. The user is editing a document with the following content:

---
${documentContent.slice(0, 3000)}${documentContent.length > 3000 ? '\n...(truncated)' : ''}
---

Answer the user's questions based on the document. Help improve, expand, or analyze the content. Be concise, professional, and helpful. Detect the language the user writes in and respond in the same language.`
    })
  } else {
    systemMessages.push({
      role: 'system',
      content: 'You are a professional writing assistant. Help users with document writing, editing, and content improvement. Detect the language the user writes in and respond in the same language.'
    })
  }

  // Set SSE headers for streaming response
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
      messages: [...systemMessages, ...messages],
      max_tokens: 1000,
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
