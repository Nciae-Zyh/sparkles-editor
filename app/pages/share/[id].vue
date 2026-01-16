<script lang="ts" setup>
import { useSafeLocalePath } from '~/utils/safeLocalePath'

definePageMeta({
  layout: 'default'
})

const route = useRoute()
const router = useRouter()
const safeLocalePath = useSafeLocalePath()

const shareId = computed(() => route.params.id as string)
const password = ref('')
const loading = ref(false)
const error = ref('')
const share = ref<any>(null)
const content = ref('')
const showPasswordInput = ref(true)
const passwordError = ref('')

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
        passwordError.value = err.data?.message || '密码错误'
      } else {
        // 需要密码，显示密码输入框
        showPasswordInput.value = true
      }
    } else if (err.statusCode === 410) {
      error.value = '分享链接已过期'
      showPasswordInput.value = false
    } else if (err.statusCode === 404) {
      error.value = '分享链接不存在'
      showPasswordInput.value = false
    } else {
      error.value = err.data?.message || '加载失败，请稍后重试'
      showPasswordInput.value = false
    }
  } finally {
    loading.value = false
  }
}

const handlePasswordSubmit = () => {
  if (!password.value.trim()) {
    passwordError.value = '请输入密码'
    return
  }
  fetchShare(true)
}

onMounted(() => {
  // 尝试无密码访问（如果不需要密码）
  fetchShare()
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex-1 w-full">
    <div class="container mx-auto px-4 py-8 max-w-4xl">
      <!-- 密码输入界面 -->
      <div
        v-if="showPasswordInput && !error"
        class="bg-white rounded-lg shadow-md p-8"
      >
        <div class="text-center mb-6">
          <h1 class="text-2xl font-bold text-gray-800 mb-2">
            查看分享的文档
          </h1>
          <p class="text-gray-600">
            此文档需要密码才能查看
          </p>
        </div>

        <form
          @submit.prevent="handlePasswordSubmit"
          class="space-y-4"
        >
          <div>
            <label
              for="password"
              class="block text-sm font-medium text-gray-700 mb-2"
            >
              访问密码
            </label>
            <input
              id="password"
              v-model="password"
              type="password"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="请输入访问密码"
              :disabled="loading"
              @keyup.enter="handlePasswordSubmit"
            />
            <p
              v-if="passwordError"
              class="mt-2 text-sm text-red-600"
            >
              {{ passwordError }}
            </p>
          </div>

          <button
            type="submit"
            :disabled="loading"
            class="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span v-if="loading">验证中...</span>
            <span v-else>查看文档</span>
          </button>
        </form>
      </div>

      <!-- 错误提示 -->
      <div
        v-if="error"
        class="bg-white rounded-lg shadow-md p-8 text-center"
      >
        <div class="text-red-600 mb-4">
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
          class="text-blue-600 hover:text-blue-700"
        >
          返回首页
        </button>
      </div>

      <!-- 加载中 -->
      <div
        v-if="loading && !showPasswordInput"
        class="flex justify-center items-center min-h-[400px]"
      >
        <UIcon
          name="i-lucide-loader-2"
          class="w-8 h-8 animate-spin text-blue-600"
        />
      </div>

      <!-- 文档内容 -->
      <div
        v-if="share && !showPasswordInput && !error"
        class="bg-white rounded-lg shadow-md"
      >
        <div class="border-b border-gray-200 px-6 py-4">
          <h1 class="text-2xl font-bold text-gray-800">
            {{ share.document_title }}
          </h1>
          <p class="text-sm text-gray-500 mt-2">
            分享时间：{{ new Date(share.created_at * 1000).toLocaleString('zh-CN') }}
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
  </div>
</template>
