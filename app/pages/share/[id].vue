<script lang="ts" setup>
import { useSafeLocalePath } from '~/utils/safeLocalePath'

definePageMeta({
  layout: 'default'
})

const route = useRoute()
const router = useRouter()
const safeLocalePath = useSafeLocalePath()
const sharesData = computed(() => $tm('shares') as Record<string, string> | undefined)

const shareId = computed(() => route.params.id as string)
const password = ref('')
const loading = ref(false)
const error = ref('')
const share = ref<any>(null)
const content = ref('')
const showPasswordInput = ref(true)
const passwordError = ref('')

// AI 总结功能
const { summarize, loading: aiSummaryLoading, error: aiSummaryError } = useAI()
const summary = ref<string>('')
const isSummaryVisible = ref(false)
const summaryCached = ref(false)

const fetchShare = async (requirePassword = false) => {
  if (loading.value) return

  loading.value = true
  error.value = ''
  passwordError.value = ''

  try {
    const query: any = {}
    if (password.value) {
      query.password = password.value
    }

    const response = await $fetch(`/api/shares/${shareId.value}`, {
      query,
      method: 'GET'
    })

    share.value = response.share
    content.value = response.share.content || ''
    showPasswordInput.value = false
  } catch (err: any) {
    if (err.statusCode === 403) {
      if (requirePassword) {
        passwordError.value = err.data?.message || sharesData.value?.passwordError || '密码错误'
      } else {
        // 需要密码，显示密码输入框
        showPasswordInput.value = true
      }
    } else if (err.statusCode === 410) {
      error.value = sharesData.value?.shareLinkExpired || '分享链接已过期'
      showPasswordInput.value = false
    } else if (err.statusCode === 404) {
      error.value = sharesData.value?.shareLinkNotFound || '分享链接不存在'
      showPasswordInput.value = false
    } else {
      error.value = err.data?.message || sharesData.value?.loadFailed || '加载失败，请稍后重试'
      showPasswordInput.value = false
    }
  } finally {
    loading.value = false
  }
}

const handlePasswordSubmit = () => {
  if (!password.value.trim()) {
    passwordError.value = sharesData.value?.enterPasswordError || '请输入密码'
    return
  }
  fetchShare(true)
}

// AI 总结处理
const handleAISummarize = async () => {
  if (!content.value || !content.value.trim()) {
    return
  }

  try {
    const result = await summarize(content.value, shareId.value)
    summary.value = result.content
    summaryCached.value = result.cached
    isSummaryVisible.value = true
  } catch (error: any) {
    console.error('AI summarize error:', error)
    // 错误已经在 composable 中处理
  }
}

onMounted(() => {
  // 尝试无密码访问（如果不需要密码）
  fetchShare()
})
</script>

<template>
  <div class="h-full  flex bg-muted flex-1 w-full">
    <UScrollArea class="w-full">
      <div class="container mx-auto px-4 py-8 max-w-4xl">
        <!-- 密码输入界面 -->
        <div
          v-if="showPasswordInput && !error"
          class="bg-default rounded-lg shadow-md p-8"
        >
          <div class="text-center mb-6">
            <h1 class="text-2xl font-bold text-highlighted mb-2">
              {{ sharesData?.viewSharedDocument || '查看分享的文档' }}
            </h1>
            <p class="text-toned">
              {{ sharesData?.passwordRequired || '此文档需要密码才能查看' }}
            </p>
          </div>

          <form
            @submit.prevent="handlePasswordSubmit"
            class="space-y-4"
          >
            <div>
              <label
                for="password"
                class="block text-sm font-medium text-default mb-2"
              >
                {{ sharesData?.enterPassword || '访问密码' }}
              </label>
              <input
                id="password"
                v-model="password"
                type="password"
                class="w-full px-4 py-2 border border-accented rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                :placeholder="sharesData?.passwordPlaceholderInput || '请输入访问密码'"
                :disabled="loading"
                @keyup.enter="handlePasswordSubmit"
              />
              <p
                v-if="passwordError"
                class="mt-2 text-sm text-error"
              >
                {{ passwordError }}
              </p>
            </div>

            <button
              type="submit"
              :disabled="loading"
              class="w-full bg-primary text-inverted py-2 px-4 rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span v-if="loading">{{ sharesData?.verifyPassword || '验证中...' }}</span>
              <span v-else>{{ sharesData?.viewDocument || '查看文档' }}</span>
            </button>
          </form>
        </div>

        <!-- 错误提示 -->
        <div
          v-if="error"
          class="bg-default rounded-lg shadow-md p-8 text-center"
        >
          <div class="text-error mb-4">
            <UIcon
              name="i-lucide-alert-circle"
              class="w-16 h-16 mx-auto mb-4"
            />
            <p class="text-lg font-semibold">
              {{ error }}
            </p>
          </div>
          <button
            @click="$router.push(safeLocalePath('/'))"
            class="text-primary hover:text-primary/80"
          >
            {{ sharesData?.backToHome || '返回首页' }}
          </button>
        </div>

        <!-- 加载中 -->
        <div
          v-if="loading && !showPasswordInput"
          class="flex justify-center items-center min-h-[400px]"
        >
          <UIcon
            name="i-lucide-loader-2"
            class="w-8 h-8 animate-spin text-primary"
          />
        </div>

        <!-- 文档内容 -->
        <div
          v-if="share && !showPasswordInput && !error"
          class="bg-default rounded-lg shadow-md"
        >
          <div class="border-b border-default px-6 py-4">
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1">
                <h1 class="text-2xl font-bold text-highlighted">
                  {{ share.document_title }}
                </h1>
                <p class="text-sm text-muted mt-2">
                  {{ sharesData?.shareTime || '分享时间' }}：{{ new Date(share.created_at * 1000).toLocaleString('zh-CN') }}
                </p>
              </div>
              <!-- AI 总结按钮 -->
              <UButton
                :loading="aiSummaryLoading"
                :disabled="!content || !content.trim()"
                color="primary"
                icon="i-lucide-sparkles"
                size="sm"
                variant="soft"
                @click="handleAISummarize"
              >
                <span v-if="!$device.isMobile">
                  {{ sharesData?.generateSummary || '生成总结' }}
                </span>
              </UButton>
            </div>
          </div>

          <!-- AI 总结显示区域 -->
          <div
            v-if="isSummaryVisible && summary"
            class="border-b border-default px-6 py-4 bg-primary/5 dark:bg-primary/10"
          >
            <div class="flex items-start gap-2 mb-2">
              <UIcon
                name="i-lucide-sparkles"
                class="w-5 h-5 text-primary mt-0.5"
              />
              <h2 class="text-lg font-semibold text-highlighted">
                {{ sharesData?.summary || '总结' }}
              </h2>
              <span
                v-if="summaryCached"
                class="text-xs text-muted ml-auto"
              >
                {{ sharesData?.aiSummaryCached || '已使用缓存的总结' }}
              </span>
            </div>
            <p class="text-sm text-default whitespace-pre-wrap">
              {{ summary }}
            </p>
          </div>

          <div class="px-6 py-4">
            <MarkdownEditor
              v-model="content"
              :readonly="true"
              :document-id="share.document_id"
              :document-title="share.document_title"
            />
          </div>
        </div>
      </div>
    </UScrollArea>
  </div>
</template>
