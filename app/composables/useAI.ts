export function useAI() {
  const loading = ref(false)
  const error = ref<string | null>(null)

  /**
   * AI 续写功能
   */
  const continueWriting = async (content: string, maxTokens = 500): Promise<string> => {
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
    summarize
  }
}
