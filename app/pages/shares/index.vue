<script lang="ts" setup>
import { useSafeLocalePath } from '~/utils/safeLocalePath'
import { useAuth } from '~/composables/useAuth'

definePageMeta({
  layout: 'default'
})

const route = useRoute()
const router = useRouter()
const { user, fetchUser } = useAuth()
const safeLocalePath = useSafeLocalePath()

const shares = ref<any[]>([])
const loading = ref(false)
const error = ref('')
const deletingIds = ref<Set<string>>(new Set())

// 获取分享列表
const fetchShares = async () => {
  if (loading.value) return

  loading.value = true
  error.value = ''

  try {
    const response = await $fetch('/api/shares')
    shares.value = response.shares || []
  } catch (err: any) {
    error.value = err.data?.message || '加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

// 删除分享
const deleteShare = async (shareId: string) => {
  if (deletingIds.value.has(shareId)) return

  if (!confirm('确定要删除这个分享链接吗？')) {
    return
  }

  deletingIds.value.add(shareId)

  try {
    await $fetch(`/api/shares/${shareId}`, {
      method: 'DELETE'
    })
    await fetchShares()
  } catch (err: any) {
    alert(err.data?.message || '删除失败，请稍后重试')
  } finally {
    deletingIds.value.delete(shareId)
  }
}

// 复制分享链接
const copyShareLink = (shareId: string) => {
  if (typeof window === 'undefined') return
  const url = `${window.location.origin}${safeLocalePath(`/share/${shareId}`)}`
  navigator.clipboard.writeText(url).then(() => {
    alert('分享链接已复制到剪贴板')
  }).catch(() => {
    alert('复制失败，请手动复制')
  })
}

// 格式化时间
const formatDate = (timestamp: number) => {
  return new Date(timestamp * 1000).toLocaleString('zh-CN')
}

// 格式化过期时间
const formatExpiresAt = (expiresAt: number | null) => {
  if (!expiresAt) return '永不过期'
  const now = Math.floor(Date.now() / 1000)
  if (expiresAt < now) return '已过期'
  return formatDate(expiresAt)
}

onMounted(async () => {
  await fetchUser()
  if (!user.value) {
    await navigateTo(safeLocalePath('/'))
    return
  }
  await fetchShares()
})
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <div class="container mx-auto px-4 py-8 max-w-6xl">
      <div class="mb-6">
        <h1 class="text-3xl font-bold text-gray-800 mb-2">
          分享管理
        </h1>
        <p class="text-gray-600">
          管理您分享的文档链接
        </p>
      </div>

      <!-- 加载中 -->
      <div
        v-if="loading && shares.length === 0"
        class="flex justify-center items-center min-h-[400px]"
      >
        <UIcon
          name="i-lucide-loader-2"
          class="w-8 h-8 animate-spin text-blue-600"
        />
      </div>

      <!-- 错误提示 -->
      <div
        v-if="error"
        class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6"
      >
        <p class="text-red-800">
          {{ error }}
        </p>
      </div>

      <!-- 空状态 -->
      <div
        v-if="!loading && shares.length === 0"
        class="bg-white rounded-lg shadow-md p-12 text-center"
      >
        <UIcon
          name="i-lucide-share-2"
          class="w-16 h-16 text-gray-400 mx-auto mb-4"
        />
        <p class="text-gray-600 text-lg">
          还没有分享任何文档
        </p>
        <p class="text-gray-500 text-sm mt-2">
          在文档编辑页面可以创建分享链接
        </p>
      </div>

      <!-- 分享列表 -->
      <div
        v-if="shares.length > 0"
        class="space-y-4"
      >
        <div
          v-for="share in shares"
          :key="share.id"
          class="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-gray-800 mb-2">
                {{ share.document_title }}
              </h3>
              
              <div class="space-y-2 text-sm text-gray-600">
                <div class="flex items-center gap-4">
                  <span>
                    <UIcon
                      name="i-lucide-eye"
                      class="w-4 h-4 inline mr-1"
                    />
                    查看次数：{{ share.view_count }}
                  </span>
                  <span>
                    <UIcon
                      name="i-lucide-lock"
                      v-if="share.has_password"
                      class="w-4 h-4 inline mr-1"
                    />
                    {{ share.has_password ? '需要密码' : '无需密码' }}
                  </span>
                  <span>
                    <UIcon
                      name="i-lucide-clock"
                      class="w-4 h-4 inline mr-1"
                    />
                    {{ formatExpiresAt(share.expires_at) }}
                  </span>
                </div>
                
                <div class="text-xs text-gray-500">
                  创建时间：{{ formatDate(share.created_at) }}
                </div>

                <div class="mt-3">
                  <div class="flex items-center gap-2 bg-gray-50 rounded px-3 py-2">
                    <input
                      :value="typeof window !== 'undefined' ? `${window.location.origin}${safeLocalePath(`/share/${share.id}`)}` : ''"
                      readonly
                      class="flex-1 bg-transparent text-sm text-gray-700 outline-none"
                    />
                    <button
                      @click="copyShareLink(share.id)"
                      class="text-blue-600 hover:text-blue-700 text-sm font-medium"
                    >
                      复制链接
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="ml-4">
              <button
                @click="deleteShare(share.id)"
                :disabled="deletingIds.has(share.id)"
                class="text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                title="删除分享"
              >
                <UIcon
                  v-if="deletingIds.has(share.id)"
                  name="i-lucide-loader-2"
                  class="w-5 h-5 animate-spin"
                />
                <UIcon
                  v-else
                  name="i-lucide-trash-2"
                  class="w-5 h-5"
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
