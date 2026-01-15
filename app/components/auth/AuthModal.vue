<script lang="ts" setup>
import { useAuth } from '~/composables/useAuth'
import { useCodeClient } from 'vue3-google-signin'
import type { ImplicitFlowSuccessResponse, ImplicitFlowErrorResponse } from 'vue3-google-signin'
import * as z from 'zod'
import type { FormSubmitEvent, FormErrorEvent } from '@nuxt/ui'

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
  set: value => emit('update:open', value)
})

const currentMode = ref(props.mode)
const error = ref('')

// 登录表单 schema
const loginSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址').min(1, '邮箱不能为空'),
  password: z.string().min(6, '密码至少需要6个字符')
})

// 注册表单 schema
const registerSchema = z.object({
  name: z.string().optional(),
  email: z.string().email('请输入有效的邮箱地址').min(1, '邮箱不能为空'),
  password: z.string().min(6, '密码至少需要6个字符')
})

const schema = computed(() => currentMode.value === 'login' ? loginSchema : registerSchema)

type LoginSchema = z.output<typeof loginSchema>
type RegisterSchema = z.output<typeof registerSchema>
type FormSchema = LoginSchema | RegisterSchema

const state = reactive<Partial<FormSchema>>({
  email: undefined,
  password: undefined,
  name: undefined
})

watch(() => props.mode, (newMode) => {
  currentMode.value = newMode
  error.value = ''
  state.email = undefined
  state.password = undefined
  state.name = undefined
})

const handleSubmit = async (event: FormSubmitEvent<FormSchema>) => {
  error.value = ''
  try {
    if (currentMode.value === 'login') {
      const data = event.data as LoginSchema
      await login(data.email, data.password)
      isOpen.value = false
    } else {
      const data = event.data as RegisterSchema
      await register(data.email, data.password, data.name)
      isOpen.value = false
    }
  } catch (err: any) {
    console.error('[AuthModal] Submit error:', {
      message: err.message,
      stack: err.stack,
      error: err
    })
    error.value = err.message || '操作失败，请查看控制台获取详细信息'
  }
}

const handleError = (event: FormErrorEvent) => {
  if (event?.errors?.[0]?.message) {
    error.value = event.errors[0].message
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

const config = useRuntimeConfig()
const clientId = config.public.googleClientId

const { isReady, login: triggerGoogleLogin } = useCodeClient({
  onSuccess: handleGoogleSuccess,
  onError: handleGoogleError,
  scope: 'openid email profile',
  client_id: clientId || ''
})

const handleGoogleLogin = () => {
  if (!clientId) {
    error.value = 'Google OAuth 未配置，请联系管理员'
    return
  }
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
          :schema="schema"
          :state="state"
          class="space-y-4"
          @submit="handleSubmit"
          @error="handleError"
        >
          <UFormField
            v-if="currentMode === 'register'"
            label="姓名"
            name="name"
          >
            <UInput
              v-model="state.name"
              placeholder="请输入姓名（可选）"
            />
          </UFormField>

          <UFormField
            label="邮箱"
            name="email"
          >
            <UInput
              v-model="state.email"
              type="email"
              placeholder="请输入邮箱"
            />
          </UFormField>

          <UFormField
            label="密码"
            name="password"
          >
            <UInput
              v-model="state.password"
              type="password"
              placeholder="请输入密码"
            />
          </UFormField>

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
          :disabled="!isReady || !clientId"
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
