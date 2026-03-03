import { logAiConfig, logAiError, logAiRequest, logAiValidationFail } from '~~/server/utils/ai-log'
import { getDBWithMigration } from '~~/server/utils/db'
import { getCurrentUser } from '~~/server/utils/auth'

const ENDPOINT = 'chat'

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

const LANGUAGE_RULE = 'CRITICAL RULE: You MUST reply in the exact same language as the user\'s message. If the user writes in Chinese, your entire response must be in Chinese. If the user writes in English, respond in English. Never switch to a different language under any circumstances.'

const ROLE_BASE_PROMPTS: Record<string, string> = {
  general: 'You are a professional writing assistant. Help users with document writing, editing, and content improvement.',
  academic: 'You are an experienced academic advisor and research mentor. You specialize in academic writing, thesis guidance, research methodology, literature reviews, citation formatting, and scholarly argument construction. Maintain academic rigor while making complex concepts accessible. Provide structured, evidence-based feedback.',
  writer: 'You are a creative writing expert and story continuator. You excel at narrative development, character building, plot continuity, vivid scene description, and maintaining consistent tone and style. When continuing a story, seamlessly pick up where the author left off while preserving their unique voice. Help overcome writer\'s block with imaginative suggestions.',
  civil: 'You are a government document writing expert specializing in official correspondence, policy documents, administrative reports, work summaries, and formal government communications. Write in clear, authoritative, and precise language appropriate for official use. Follow formal document conventions and ensure compliance with bureaucratic standards.',
  copywriter: 'You are a professional copywriter and marketing expert. Craft compelling, persuasive content for brands, products, and campaigns. You understand consumer psychology, brand voice, call-to-action optimization, and storytelling in marketing. Write for various formats: ads, landing pages, social media, emails, and product descriptions.',
  translator: 'You are a professional translator with expertise in multiple languages. Provide accurate, natural-sounding translations that preserve the original meaning, tone, and cultural nuances. Handle technical documents, literary works, business communications, and casual content with equal skill.'
}

export default eventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const body = await readBody(event).catch((e) => {
    logAiError(ENDPOINT, e, { phase: 'readBody' })
    throw createError({ statusCode: 400, message: 'Invalid request body' })
  })

  const { messages, documentContent, sessionId, documentId, role } = body as {
    messages: ChatMessage[]
    documentContent?: string
    sessionId?: string
    documentId?: string
    role?: string
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

  const roleId = (role && ROLE_BASE_PROMPTS[role]) ? role : 'general'
  const rolePrompt = ROLE_BASE_PROMPTS[roleId]!

  const systemMessages: ChatMessage[] = []
  if (documentContent) {
    systemMessages.push({
      role: 'system',
      content: `${rolePrompt}\n\nThe user is editing a document with the following content:\n\n---\n${documentContent.slice(0, 3000)}${documentContent.length > 3000 ? '\n...(truncated)' : ''}\n---\n\nAnswer the user's questions based on the document. Help improve, expand, or analyze the content. Be concise and helpful.\n\n${LANGUAGE_RULE}`
    })
  } else {
    systemMessages.push({
      role: 'system',
      content: `${rolePrompt}\n\n${LANGUAGE_RULE}`
    })
  }

  // Persist conversation to DB if user is authenticated and sessionId provided
  let db: Awaited<ReturnType<typeof getDBWithMigration>> | null = null
  let userId: string | null = null

  if (sessionId) {
    try {
      const user = await getCurrentUser(event)
      if (user) {
        userId = user.id
        db = await getDBWithMigration(event)

        // Create session if it doesn't exist
        const existing = await db.prepare(
          'SELECT id FROM ai_chat_sessions WHERE id = ?'
        ).bind(sessionId).first()

        if (!existing) {
          const lastUserMsg = messages[messages.length - 1]
          const title = lastUserMsg?.role === 'user'
            ? lastUserMsg.content.slice(0, 100)
            : ''
          await db.prepare(`
            INSERT INTO ai_chat_sessions (id, user_id, document_id, title, message_count)
            VALUES (?, ?, ?, ?, 0)
          `).bind(sessionId, userId, documentId ?? null, title).run()
        }

        // Save the latest user message
        const lastUserMsg = messages[messages.length - 1]
        if (lastUserMsg?.role === 'user') {
          await db.prepare(`
            INSERT INTO ai_chat_messages (id, session_id, role, content)
            VALUES (?, ?, 'user', ?)
          `).bind(crypto.randomUUID(), sessionId, lastUserMsg.content).run()
          await db.prepare(`
            UPDATE ai_chat_sessions
            SET message_count = message_count + 1, updated_at = unixepoch()
            WHERE id = ?
          `).bind(sessionId).run()
        }
      }
    } catch (e) {
      // DB persistence is best-effort; do not block the chat response
      console.warn('[chat] Failed to persist session/user message:', e)
      db = null
    }
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

  // Capture db and sessionId in closure for post-stream save
  const capturedDb = db
  const capturedSessionId = sessionId

  return sendStream(event, new ReadableStream({
    async pull(controller) {
      let fullResponse = ''
      try {
        outer: while (true) {
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
                break outer  // exit while loop, not the pull function
              }
              try {
                const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> }
                const textChunk = parsed.choices?.[0]?.delta?.content
                if (textChunk) {
                  fullResponse += textChunk
                  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ text: textChunk })}\n\n`))
                }
              } catch {
                // Skip malformed lines
              }
            }
          }
        }
      } catch (err) {
        logAiError(ENDPOINT, err, { phase: 'stream' })
        controller.close()
      }

      // Save assistant message after streaming completes
      if (capturedDb && capturedSessionId && fullResponse) {
        try {
          await capturedDb.prepare(`
            INSERT INTO ai_chat_messages (id, session_id, role, content)
            VALUES (?, ?, 'assistant', ?)
          `).bind(crypto.randomUUID(), capturedSessionId, fullResponse).run()
          await capturedDb.prepare(`
            UPDATE ai_chat_sessions
            SET message_count = message_count + 1, updated_at = unixepoch()
            WHERE id = ?
          `).bind(capturedSessionId).run()
        } catch (e) {
          console.warn('[chat] Failed to persist assistant message:', e)
        }
      }
    },
    cancel() {
      reader.cancel()
    }
  }))
})
