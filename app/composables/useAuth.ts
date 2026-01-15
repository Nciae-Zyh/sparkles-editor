import type { User } from '~~/types'

export const useAuth = () => {
  const user = useState<User | null>('auth.user', () => null)
  const loading = ref(false)

  const fetchUser = async () => {
    try {
      loading.value = true
      const data = await $fetch<{ user: User }>('/api/auth/me')
      user.value = data.user
      return data.user
    } catch (error) {
      user.value = null
      return null
    } finally {
      loading.value = false
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
    } catch (error: any) {
      throw new Error(error.data?.message || 'Login failed')
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
    } catch (error: any) {
      console.error('[useAuth] Registration error:', {
        statusCode: error.statusCode,
        statusMessage: error.statusMessage,
        message: error.message,
        data: error.data,
        response: error.response,
        error: error
      })

      // 提取详细错误信息
      let errorMessage = 'Registration failed'

      if (error.data?.message) {
        errorMessage = error.data.message
      } else if (error.message) {
        errorMessage = error.message
      } else if (error.statusMessage) {
        errorMessage = `${error.statusMessage} (${error.statusCode || 'Unknown'})`
      }

      // 如果是 500 错误，添加更多调试信息
      if (error.statusCode === 500) {
        errorMessage += '. Please check the server logs for more details.'
        if (error.data) {
          console.error('[useAuth] Error data:', error.data)
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
    } catch (error: any) {
      throw new Error(error.data?.message || 'Google login failed')
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
    fetchUser,
    login,
    register,
    loginWithGoogleCode,
    logout
  }
}
