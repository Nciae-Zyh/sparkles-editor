<script lang="ts" setup>
import { useAuth } from '~/composables/useAuth'
import { useCodeClient } from 'vue3-google-signin'
import type { ImplicitFlowSuccessResponse, ImplicitFlowErrorResponse } from 'vue3-google-signin'
import * as z from 'zod'
import type { FormSubmitEvent, FormErrorEvent } from '@nuxt/ui'

const { tm: $tm, t } = useI18n()

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

const authData = computed(() => $tm('auth') as Record<string, string> | undefined)

// 登录表单 schema
const loginSchema = computed(() => z.object({
  email: z.string().email(authData.value?.emailInvalid || t('auth.emailInvalid')).min(1, authData.value?.emailRequired || t('auth.emailRequired')),
  password: z.string().min(6, authData.value?.passwordMinLength || t('auth.passwordMinLength'))
}))

// 注册表单 schema
const registerSchema = computed(() => z.object({
  name: z.string().optional(),
  email: z.string().email(authData.value?.emailInvalid || t('auth.emailInvalid')).min(1, authData.value?.emailRequired || t('auth.emailRequired')),
  password: z.string().min(6, authData.value?.passwordMinLength || t('auth.passwordMinLength'))
}))

const schema = computed(() => currentMode.value === 'login' ? loginSchema.value : registerSchema.value)

type LoginSchema = z.output<typeof loginSchema>
type RegisterSchema = z.output<typeof registerSchema>
type FormSchema = LoginSchema | RegisterSchema

const state = reactive<Partial<FormSchema>>({
  email: undefined,
  password: undefined,
  name: undefined
})

const getErrorMessage = (err: unknown) => {
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message
    if (typeof message === 'string') {
      return message
    }
  }
  return ''
}

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
  } catch (err: unknown) {
    console.error('[AuthModal] Submit error:', {
      message: getErrorMessage(err),
      stack: (err as { stack?: unknown })?.stack,
      error: err
    })
    error.value = getErrorMessage(err) || authData.value?.operationFailed || t('auth.operationFailed')
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
  } catch (err: unknown) {
    error.value = getErrorMessage(err) || authData.value?.googleLoginFailed || t('auth.googleLoginFailed')
  }
}

const handleGoogleError = (errorResponse: ImplicitFlowErrorResponse) => {
  error.value = errorResponse.error || authData.value?.googleLoginFailed || t('auth.googleLoginFailed')
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
    error.value = authData.value?.googleOAuthNotConfigured || t('auth.googleOAuthNotConfigured')
    return
  }
  if (!isReady.value) {
    error.value = authData.value?.googleLoginNotReady || t('auth.googleLoginNotReady')
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
    :title="currentMode === 'login' ? (authData?.login || t('auth.login')) : (authData?.register || t('auth.register'))"
  >
    <template #body>
      <div class="space-y-4">
        <UAlert
          v-if="error"
          color="error"
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
            :label="authData?.name || t('auth.name')"
            name="name"
          >
            <UInput
              v-model="state.name"
              :placeholder="authData?.enterName || t('auth.enterName')"
            />
          </UFormField>

          <UFormField
            :label="authData?.email || t('auth.email')"
            name="email"
          >
            <UInput
              v-model="state.email"
              type="email"
              :placeholder="authData?.enterEmail || t('auth.enterEmail')"
            />
          </UFormField>

          <UFormField
            :label="authData?.password || t('auth.password')"
            name="password"
          >
            <UInput
              v-model="state.password"
              type="password"
              :placeholder="authData?.enterPassword || t('auth.enterPassword')"
            />
          </UFormField>

          <UButton
            type="submit"
            block
            :loading="loading"
          >
            {{ currentMode === 'login' ? (authData?.login || t('auth.login')) : (authData?.register || t('auth.register')) }}
          </UButton>
        </UForm>

        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-default" />
          </div>
          <div class="relative flex justify-center text-sm">
            <span class="px-2 bg-default text-muted">
              {{ authData?.or || t('auth.or') }}
            </span>
          </div>
        </div>

        <UButton
          color="neutral"
          variant="outline"
          block
          icon="i-simple-icons-google"
          :loading="loading"
          :disabled="!isReady || !clientId"
          @click="handleGoogleLogin"
        >
          {{ authData?.loginWithGoogle || t('auth.loginWithGoogle') }}
        </UButton>

        <div class="text-center text-sm">
          <button
            type="button"
            class="text-primary hover:underline"
            @click="switchMode"
          >
            {{ currentMode === 'login' ? (authData?.noAccount || t('auth.noAccount')) : (authData?.hasAccount || t('auth.hasAccount')) }}
          </button>
        </div>
      </div>
    </template>
  </UModal>
</template>
