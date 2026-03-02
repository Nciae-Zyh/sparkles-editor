<script lang="ts" setup>
import { useSafeLocalePath } from '~/utils/safeLocalePath'
import { useAuth } from '~/composables/useAuth'

const { tm: $tm, t } = useI18n()

definePageMeta({
  layout: 'default'
})

const { user, fetchUser } = useAuth()
const safeLocalePath = useSafeLocalePath()
const sharesData = computed(() => $tm('shares') as Record<string, string> | undefined)

interface ShareListItem {
  id: string
  document_title: string
  view_count: number
  has_password: boolean
  expires_at: number | null
  created_at: number
}

const getErrorMessage = (err: unknown) => {
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message
    if (typeof message === 'string') {
      return message
    }
  }
  return ''
}

const shares = ref<ShareListItem[]>([])
const loading = ref(false)
const error = ref('')
const deletingIds = ref<Set<string>>(new Set())

// 获取分享列表
const fetchShares = async () => {
  if (loading.value) return

  loading.value = true
  error.value = ''

  try {
    const response = await $fetch<{ shares: ShareListItem[] }>('/api/shares')
    shares.value = response.shares || []
  } catch (err: unknown) {
    const apiMessage = (err as { data?: { message?: string } })?.data?.message
    error.value = apiMessage || getErrorMessage(err) || sharesData.value?.loadFailed || t('shares.loadFailed')
  } finally {
    loading.value = false
  }
}

// 删除分享
const deleteShare = async (shareId: string) => {
  if (deletingIds.value.has(shareId)) return

  if (!confirm(sharesData.value?.deleteConfirm || t('shares.deleteConfirm'))) {
    return
  }

  deletingIds.value.add(shareId)

  try {
    await $fetch(`/api/shares/${shareId}`, {
      method: 'DELETE'
    })
    await fetchShares()
  } catch (err: unknown) {
    const apiMessage = (err as { data?: { message?: string } })?.data?.message
    alert(apiMessage || getErrorMessage(err) || sharesData.value?.deleteFailed || t('shares.deleteFailed'))
  } finally {
    deletingIds.value.delete(shareId)
  }
}

// 复制分享链接
const copyShareLink = (shareId: string) => {
  if (typeof window === 'undefined') return
  const url = `${window.location.origin}${safeLocalePath(`/share/${shareId}`)}`
  navigator.clipboard.writeText(url).then(() => {
    alert(sharesData.value?.shareLinkCopied || t('shares.shareLinkCopied'))
  }).catch(() => {
    alert(sharesData.value?.copyFailed || t('shares.copyFailed'))
  })
}

// 格式化时间
const formatDate = (timestamp: number) => {
  return new Date(timestamp * 1000).toLocaleString('zh-CN')
}

// 格式化过期时间
const formatExpiresAt = (expiresAt: number | null) => {
  if (!expiresAt) return sharesData.value?.neverExpires || t('shares.neverExpires')
  const now = Math.floor(Date.now() / 1000)
  if (expiresAt < now) return sharesData.value?.expired || t('shares.expired')
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
  <div class="bg-muted flex-1 w-full flex">
    <UScrollArea class="w-full">
      <div class="container mx-auto px-4 py-8 max-w-6xl">
        <div class="mb-6">
          <h1 class="text-3xl font-bold text-highlighted mb-2">
            {{ sharesData?.shareManagement || t('shares.shareManagement') }}
          </h1>
          <p class="text-toned">
            {{ sharesData?.manageShareLinks || t('shares.manageShareLinks') }}
          </p>
        </div>

        <!-- 加载中 -->
        <div
          v-if="loading && shares.length === 0"
          class="flex justify-center items-center min-h-[400px]"
        >
          <UIcon
            name="i-lucide-loader-2"
            class="w-8 h-8 animate-spin text-primary"
          />
        </div>

        <!-- 错误提示 -->
        <div
          v-if="error"
          class="bg-error/10 border border-error/20 rounded-lg p-4 mb-6"
        >
          <p class="text-error">
            {{ error }}
          </p>
        </div>

        <!-- 空状态 -->
        <div
          v-if="!loading && shares.length === 0"
          class="bg-default rounded-lg shadow-md p-12 text-center"
        >
          <UIcon
            name="i-lucide-share-2"
            class="w-16 h-16 text-dimmed mx-auto mb-4"
          />
          <p class="text-toned text-lg">
            {{ sharesData?.noShares || t('shares.noShares') }}
          </p>
          <p class="text-muted text-sm mt-2">
            {{ sharesData?.createShareHint || t('shares.createShareHint') }}
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
            class="bg-default rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <h3 class="text-lg font-semibold text-highlighted mb-2">
                  {{ share.document_title }}
                </h3>

                <div class="space-y-2 text-sm text-toned">
                  <div class="flex items-center gap-4">
                    <span>
                      <UIcon
                        name="i-lucide-eye"
                        class="w-4 h-4 inline mr-1"
                      />
                      {{ sharesData?.viewCount || t('shares.viewCount') }}：{{ share.view_count }}
                    </span>
                    <span>
                      <UIcon
                        v-if="share.has_password"
                        name="i-lucide-lock"
                        class="w-4 h-4 inline mr-1"
                      />
                      {{ share.has_password ? (sharesData?.requiresPassword || t('shares.requiresPassword')) : (sharesData?.noPassword || t('shares.noPassword')) }}
                    </span>
                    <span>
                      <UIcon
                        name="i-lucide-clock"
                        class="w-4 h-4 inline mr-1"
                      />
                      {{ formatExpiresAt(share.expires_at) }}
                    </span>
                  </div>

                  <div class="text-xs text-muted">
                    {{ sharesData?.createdAt || t('shares.createdAt') }}：{{ formatDate(share.created_at) }}
                  </div>

                  <div class="mt-3">
                    <div class="flex items-center gap-2 bg-muted rounded px-3 py-2">
                      <input
                        :value="typeof window !== 'undefined' ? `${window.location.origin}${safeLocalePath(`/share/${share.id}`)}` : ''"
                        readonly
                        class="flex-1 bg-transparent text-sm text-default outline-none"
                      >
                      <button
                        class="text-primary hover:text-primary/80 text-sm font-medium"
                        @click="copyShareLink(share.id)"
                      >
                        {{ sharesData?.copyLink || t('shares.copyLink') }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="ml-4">
                <button
                  :disabled="deletingIds.has(share.id)"
                  class="text-error hover:text-error/80 disabled:opacity-50 disabled:cursor-not-allowed"
                  :title="sharesData?.deleteShare || t('shares.deleteShare')"
                  @click="deleteShare(share.id)"
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
    </UScrollArea>
  </div>
</template>
