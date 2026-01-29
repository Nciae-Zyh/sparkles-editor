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

      if (!response.success || !response.content) {
        throw new Error('Failed to generate continuation')
      }

      return response.content
    } catch (err: any) {
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

      if (!response.success || !response.content) {
        throw new Error('Failed to expand selection')
      }

      return response.content
    } catch (err: any) {
      error.value = err.message || '扩写失败，请稍后重试'
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

      if (!response.success || !response.content) {
        throw new Error('Failed to generate summary')
      }

      return {
        content: response.content,
        cached: response.cached || false
      }
    } catch (err: any) {
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
    summarize
  }
}
