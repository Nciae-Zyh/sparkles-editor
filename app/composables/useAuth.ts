import type { User } from '~~/types'

export const useAuth = () => {
  const { t } = useI18n()
  const user = useState<User | null>('auth.user', () => null)
  const loading = ref(false)
  const authInitialized = useState<boolean>('auth.initialized', () => false)

  const getErrorMessage = (error: unknown) => {
    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as { message?: unknown }).message
      if (typeof message === 'string') {
        return message
      }
    }
    return ''
  }

  const fetchUser = async () => {
    try {
      loading.value = true
      const data = await $fetch<{ user: User }>('/api/auth/me')
      user.value = data.user
      return data.user
    } catch {
      user.value = null
      return null
    } finally {
      loading.value = false
      authInitialized.value = true
    }
  }

  const login = async (email: string, password: string) => {
    try {
      loading.value = true
      const data = await $fetch<{ success: boolean, user: User }>('/api/auth/login', {
        method: 'POST',
        body: { email, password }
      })
      user.value = data.user
      await navigateTo('/', { replace: true })
      return data.user
    } catch (error: unknown) {
      const message = (error as { data?: { message?: string } })?.data?.message
      throw new Error(message || getErrorMessage(error) || t('auth.operationFailed'))
    } finally {
      loading.value = false
    }
  }

  const register = async (email: string, password: string, name?: string) => {
    try {
      loading.value = true
      const data = await $fetch<{ success: boolean, user: User }>('/api/auth/register', {
        method: 'POST',
        body: { email, password, name }
      })
      user.value = data.user
      await navigateTo('/', { replace: true })
      return data.user
    } catch (error: unknown) {
      const errorData = (error as { data?: unknown })?.data
      const errorStatusCode = (error as { statusCode?: unknown })?.statusCode
      const errorStatusMessage = (error as { statusMessage?: unknown })?.statusMessage
      console.error('[useAuth] Registration error:', {
        statusCode: errorStatusCode,
        statusMessage: errorStatusMessage,
        message: getErrorMessage(error),
        data: errorData,
        response: (error as { response?: unknown })?.response,
        error
      })

      // 提取详细错误信息
      let errorMessage = t('auth.operationFailed')

      if (typeof (error as { data?: { message?: unknown } })?.data?.message === 'string') {
        errorMessage = (error as { data: { message: string } }).data.message
      } else if (getErrorMessage(error)) {
        errorMessage = getErrorMessage(error)
      } else if (typeof errorStatusMessage === 'string') {
        errorMessage = `${errorStatusMessage} (${errorStatusCode || t('actions.unknown')})`
      }

      // 如果是 500 错误，添加更多调试信息
      if (errorStatusCode === 500) {
        errorMessage += '. Please check the server logs for more details.'
        if (errorData) {
          console.error('[useAuth] Error data:', errorData)
        }
      }

      throw new Error(errorMessage)
    } finally {
      loading.value = false
    }
  }

  const loginWithGoogleCode = async (code: string) => {
    try {
      loading.value = true
      // 获取当前页面的 origin 作为 redirect_uri
      const redirectUri = typeof window !== 'undefined' ? window.location.origin : ''
      const data = await $fetch<{ success: boolean, user: User }>('/api/auth/google/code', {
        method: 'POST',
        body: { code, redirectUri }
      })
      user.value = data.user
      await navigateTo('/', { replace: true })
      return data.user
    } catch (error: unknown) {
      const message = (error as { data?: { message?: string } })?.data?.message
      throw new Error(message || getErrorMessage(error) || t('auth.googleLoginFailed'))
    } finally {
      loading.value = false
    }
  }

  const logout = async () => {
    try {
      loading.value = true
      await $fetch('/api/auth/logout', {
        method: 'POST'
      })
      user.value = null
    } catch (error) {
      console.error('Logout failed:', error)
    } finally {
      loading.value = false
    }
  }

  return {
    user: readonly(user),
    loading: readonly(loading),
    authInitialized: readonly(authInitialized),
    fetchUser,
    login,
    register,
    loginWithGoogleCode,
    logout
  }
}
