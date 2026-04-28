import { logAiConfig, logAiError, logAiRequest, logAiSuccess } from '~~/server/utils/ai-log'

const ENDPOINT = 'tts'

export default eventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const body = await readBody(event).catch((e) => {
    logAiError(ENDPOINT, e, { phase: 'readBody' })
    throw createError({ statusCode: 400, message: 'Invalid request body' })
  })

  const { text, voice = 'mimo_default', speed, emotion, style } = body

  logAiRequest(ENDPOINT, {
    hasText: !!text,
    textLength: typeof text === 'string' ? text.length : 0,
    voice,
    hasSpeed: !!speed,
    hasEmotion: !!emotion,
    hasStyle: !!style
  })

  if (!text || typeof text !== 'string') {
    throw createError({
      statusCode: 400,
      message: 'Text is required and must be string'
    })
  }

  // 限制文本长度（TTS 通常有 4000 字符限制）
  const MAX_TEXT_LENGTH = 4000
  const truncatedText = text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text

  const apiUrl = (config.xiaomiAiApiUrl as string) || 'https://api.xiaomimimo.com/v1'
  const hasApiKey = !!(config.xiaomiAiApiKey as string)?.trim()

  logAiConfig(ENDPOINT, { hasApiKey, apiUrl })

  if (!hasApiKey) {
    logAiError(ENDPOINT, new Error('AI API key is not configured'), { phase: 'config' })
    throw createError({
      statusCode: 500,
      message: 'AI API key is not configured'
    })
  }

  // 构建 messages 数组
  const messages: Array<{ role: string; content: string }> = []

  // System message: 语音风格指令
  if (style) {
    messages.push({
      role: 'system',
      content: style
    })
  }

  // 构建 assistant message 内容
  let content = truncatedText

  // 语速/情绪指令前缀
  const instructions: string[] = []
  if (speed) instructions.push(`语速${speed}`)
  if (emotion) instructions.push(`情绪${emotion}`)

  if (instructions.length > 0) {
    content = `[${instructions.join(',')}] ${content}`
  }

  messages.push({
    role: 'assistant',
    content
  })

  // 构建请求体
  const requestBody = {
    model: 'mimo-v2.5-tts',
    messages,
    audio: {
      format: 'wav',
      voice
    }
  }

  try {
    const requestUrl = `${apiUrl}/chat/completions`

    logAiRequest(ENDPOINT, { phase: 'calling_api', url: requestUrl })

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': config.xiaomiAiApiKey as string
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorText = await response.text()
      logAiError(ENDPOINT, new Error(`MiMo API error ${response.status}: ${errorText}`), {
        phase: 'api_response',
        status: response.status
      })
      throw createError({
        statusCode: response.status,
        message: `TTS API error: ${errorText}`
      })
    }

    const data = await response.json()
    const audioData = data.choices?.[0]?.message?.audio?.data

    if (!audioData) {
      logAiError(ENDPOINT, new Error('No audio data in response'), { phase: 'parse_response' })
      throw createError({
        statusCode: 500,
        message: 'No audio data in TTS response'
      })
    }

    logAiSuccess(ENDPOINT, {
      audioDataLength: audioData.length,
      voice
    })

    // 返回 base64 编码的音频数据
    return {
      success: true,
      audio: audioData,
      format: 'wav'
    }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }
    logAiError(ENDPOINT, error, { phase: 'unexpected' })
    throw createError({
      statusCode: 500,
      message: 'TTS request failed'
    })
  }
})
