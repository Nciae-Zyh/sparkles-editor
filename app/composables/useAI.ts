const AI_LOG_PREFIX = '[AI]'

/** 前端 AI 调用日志，便于正式环境排查。生产环境也会输出，仅记录长度/状态不记录正文。 */
function logClient(action: string, meta: Record<string, unknown>) {
  console.info(AI_LOG_PREFIX, action, meta)
}

function logClientError(action: string, err: unknown, meta?: Record<string, unknown>) {
  console.error(AI_LOG_PREFIX, action, 'error', err, meta ?? '')
}

export function useAI() {
  const loading = ref(false)
  const error = ref<string | null>(null)

  /**
   * AI 续写功能
   * @param content 完整文档内容（作为上下文）
   * @param currentParagraph 当前段落内容（可选，如果有则续写当前段落，否则续写新内容）
   * @param maxTokens 最大 token 数
   */
  const continueWriting = async (
    content: string,
    currentParagraph?: string,
    maxTokens = 500
  ): Promise<string> => {
    loading.value = true
    error.value = null

    logClient('continue request', {
      contentLength: content?.length ?? 0,
      hasCurrentParagraph: !!currentParagraph,
      currentParagraphLength: currentParagraph?.length ?? 0,
      maxTokens
    })

    try {
      const response = await $fetch<{
        success: boolean
        content: string
      }>('/api/ai/continue', {
        method: 'POST',
        body: {
          content,
          context: content,
          currentParagraph,
          maxTokens
        }
      })

      logClient('continue response', {
        success: response?.success,
        contentLength: response?.content?.length ?? 0
      })

      if (!response.success || !response.content) {
        throw new Error('Failed to generate continuation')
      }

      return response.content
    } catch (err: any) {
      const statusCode = err?.statusCode ?? err?.status
      const data = err?.data ?? err?.data
      logClientError('continue', err, {
        statusCode,
        message: err?.message,
        data: data != null ? (typeof data === 'object' ? JSON.stringify(data).slice(0, 300) : String(data)) : undefined
      })
      error.value = err.message || '续写失败，请稍后重试'
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * AI 选中扩写：对选中的文本进行扩写
   * @param selectedText 选中的文本
   * @param context 可选，周围上下文
   * @param maxTokens 最大 token 数
   */
  const expandSelected = async (
    selectedText: string,
    context?: string,
    maxTokens = 500
  ): Promise<string> => {
    loading.value = true
    error.value = null

    logClient('expand request', {
      selectedTextLength: selectedText?.length ?? 0,
      contextLength: context?.length ?? 0,
      maxTokens
    })

    try {
      const response = await $fetch<{
        success: boolean
        content: string
      }>('/api/ai/expand', {
        method: 'POST',
        body: {
          selectedText,
          context,
          maxTokens
        }
      })

      logClient('expand response', {
        success: response?.success,
        contentLength: response?.content?.length ?? 0
      })

      if (!response.success || !response.content) {
        throw new Error('Failed to expand selection')
      }

      return response.content
    } catch (err: any) {
      const statusCode = err?.statusCode ?? err?.status
      const data = err?.data ?? err?.data
      logClientError('expand', err, {
        statusCode,
        message: err?.message,
        data: data != null ? (typeof data === 'object' ? JSON.stringify(data).slice(0, 300) : String(data)) : undefined
      })
      error.value = err.message || '扩写失败，请稍后重试'
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * AI 润色：对选中的文本进行润色优化
   * @param selectedText 选中的文本
   * @param context 可选，周围上下文
   * @param maxTokens 最大 token 数
   */
  const polishSelected = async (
    selectedText: string,
    context?: string,
    maxTokens = 500
  ): Promise<string> => {
    loading.value = true
    error.value = null

    logClient('polish request', {
      selectedTextLength: selectedText?.length ?? 0,
      contextLength: context?.length ?? 0,
      maxTokens
    })

    try {
      const response = await $fetch<{
        success: boolean
        content: string
      }>('/api/ai/polish', {
        method: 'POST',
        body: {
          selectedText,
          context,
          maxTokens
        }
      })

      logClient('polish response', {
        success: response?.success,
        contentLength: response?.content?.length ?? 0
      })

      if (!response.success || !response.content) {
        throw new Error('Failed to polish selection')
      }

      return response.content
    } catch (err: any) {
      const statusCode = err?.statusCode ?? err?.status
      const data = err?.data ?? err?.data
      logClientError('polish', err, {
        statusCode,
        message: err?.message,
        data: data != null ? (typeof data === 'object' ? JSON.stringify(data).slice(0, 300) : String(data)) : undefined
      })
      error.value = err.message || '润色失败，请稍后重试'
      throw err
    } finally {
      loading.value = false
    }
  }

  /**
   * AI 总结功能（带缓存）
   */
  const summarize = async (content: string, shareId?: string): Promise<{
    content: string
    cached: boolean
  }> => {
    loading.value = true
    error.value = null

    logClient('summarize request', {
      contentLength: content?.length ?? 0,
      shareId: shareId ?? '(none)'
    })

    try {
      const response = await $fetch<{
        success: boolean
        content: string
        cached: boolean
      }>('/api/ai/summarize', {
        method: 'POST',
        body: {
          content,
          shareId
        }
      })

      logClient('summarize response', {
        success: response?.success,
        contentLength: response?.content?.length ?? 0,
        cached: response?.cached
      })

      if (!response.success || !response.content) {
        throw new Error('Failed to generate summary')
      }

      return {
        content: response.content,
        cached: response.cached || false
      }
    } catch (err: any) {
      const statusCode = err?.statusCode ?? err?.status
      const data = err?.data ?? err?.data
      logClientError('summarize', err, {
        statusCode,
        message: err?.message,
        data: data != null ? (typeof data === 'object' ? JSON.stringify(data).slice(0, 300) : String(data)) : undefined
      })
      error.value = err.message || '总结失败，请稍后重试'
      throw err
    } finally {
      loading.value = false
    }
  }

  return {
    loading: readonly(loading),
    error: readonly(error),
    continueWriting,
    expandSelected,
    polishSelected,
    summarize
  }
}
