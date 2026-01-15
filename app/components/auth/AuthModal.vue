<script lang="ts" setup>
import { useAuth } from '~/composables/useAuth'
import { useCodeClient } from 'vue3-google-signin'
import type { ImplicitFlowSuccessResponse, ImplicitFlowErrorResponse } from 'vue3-google-signin'

interface Props {
  open: boolean
  mode?: 'login' | 'register'
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'login'
})

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const { login, register, loginWithGoogleCode, loading } = useAuth()

const isOpen = computed({
  get: () => props.open,
  set: (value) => emit('update:open', value)
})

const currentMode = ref(props.mode)
const email = ref('')
const password = ref('')
const name = ref('')
const error = ref('')

watch(() => props.mode, (newMode) => {
  currentMode.value = newMode
  error.value = ''
  email.value = ''
  password.value = ''
  name.value = ''
})

const handleSubmit = async () => {
  error.value = ''
  try {
    if (currentMode.value === 'login') {
      await login(email.value, password.value)
      isOpen.value = false
    } else {
      await register(email.value, password.value, name.value || undefined)
      isOpen.value = false
    }
  } catch (err: any) {
    error.value = err.message || '操作失败'
  }
}

// Google OAuth 使用 code flow
const handleGoogleSuccess = async (response: ImplicitFlowSuccessResponse) => {
  error.value = ''
  try {
    await loginWithGoogleCode(response.code)
    isOpen.value = false
  } catch (err: any) {
    error.value = err.message || 'Google 登录失败'
  }
}

const handleGoogleError = (errorResponse: ImplicitFlowErrorResponse) => {
  error.value = errorResponse.error || 'Google 登录失败'
  console.error('Google login error:', errorResponse)
}

const { isReady, login: triggerGoogleLogin } = useCodeClient({
  onSuccess: handleGoogleSuccess,
  onError: handleGoogleError,
  scope: 'openid email profile'
})

const handleGoogleLogin = () => {
  if (!isReady.value) {
    error.value = 'Google 登录服务未就绪，请稍后再试'
    return
  }
  error.value = ''
  triggerGoogleLogin()
}

const switchMode = () => {
  currentMode.value = currentMode.value === 'login' ? 'register' : 'login'
  error.value = ''
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :title="currentMode === 'login' ? '登录' : '注册'"
  >
    <template #body>
      <div class="space-y-4">
        <UAlert
          v-if="error"
          color="red"
          variant="soft"
          :title="error"
        />

        <UForm
          class="space-y-4"
          @submit.prevent="handleSubmit"
        >
          <UFormGroup
            v-if="currentMode === 'register'"
            label="姓名"
            name="name"
          >
            <UInput
              v-model="name"
              placeholder="请输入姓名（可选）"
            />
          </UFormGroup>

          <UFormGroup
            label="邮箱"
            name="email"
            required
          >
            <UInput
              v-model="email"
              type="email"
              placeholder="请输入邮箱"
              required
            />
          </UFormGroup>

          <UFormGroup
            label="密码"
            name="password"
            required
          >
            <UInput
              v-model="password"
              type="password"
              placeholder="请输入密码"
              required
            />
          </UFormGroup>

          <UButton
            type="submit"
            block
            :loading="loading"
          >
            {{ currentMode === 'login' ? '登录' : '注册' }}
          </UButton>
        </UForm>

        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-gray-200 dark:border-gray-700" />
          </div>
          <div class="relative flex justify-center text-sm">
            <span class="px-2 bg-white dark:bg-gray-900 text-gray-500">
              或
            </span>
          </div>
        </div>

        <UButton
          color="gray"
          variant="outline"
          block
          icon="i-simple-icons-google"
          :loading="loading"
          :disabled="!isReady"
          @click="handleGoogleLogin"
        >
          使用 Google 登录
        </UButton>

        <div class="text-center text-sm">
          <button
            type="button"
            class="text-primary hover:underline"
            @click="switchMode"
          >
            {{ currentMode === 'login' ? '还没有账号？立即注册' : '已有账号？立即登录' }}
          </button>
        </div>
      </div>
    </template>
  </UModal>
</template>
