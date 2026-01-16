<script lang="ts" setup>
import { useSafeLocalePath } from '~/utils/safeLocalePath'

interface Props {
  documentId: string
  documentTitle: string
  open?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  open: false
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  close: []
}>()

const safeLocalePath = useSafeLocalePath()

const isOpen = computed({
  get: () => props.open,
  set: (value) => {
    emit('update:open', value)
    if (!value) {
      emit('close')
    }
  }
})

const loading = ref(false)
const error = ref('')
const password = ref('')
const expiresAt = ref('')
const shareId = ref<string | null>(null)
const shareUrl = ref('')

// 创建分享
const createShare = async () => {
  if (loading.value) return

  loading.value = true
  error.value = ''

  try {
    const body: any = {
      document_id: props.documentId
    }

    if (password.value.trim()) {
      body.password = password.value.trim()
    }

    if (expiresAt.value) {
      body.expires_at = expiresAt.value
    }

    const response = await $fetch('/api/shares', {
      method: 'POST',
      body
    })

    shareId.value = response.share.id
    if (typeof window !== 'undefined') {
      shareUrl.value = `${window.location.origin}${safeLocalePath(`/share/${response.share.id}`)}`
    }
  } catch (err: any) {
    error.value = err.data?.message || '创建分享失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

// 复制分享链接
const copyShareLink = () => {
  navigator.clipboard.writeText(shareUrl.value).then(() => {
    alert('分享链接已复制到剪贴板')
  }).catch(() => {
    alert('复制失败，请手动复制')
  })
}

// 关闭模态框
const close = () => {
  isOpen.value = false
}

// 重置表单
const reset = () => {
  password.value = ''
  expiresAt.value = ''
  shareId.value = null
  shareUrl.value = ''
  error.value = ''
}

// 监听关闭事件，重置表单
watch(() => props.documentId, () => {
  reset()
})
</script>

<template>
  <UModal
    v-model:open="isOpen"
    title="分享文档"
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <div class="space-y-4">
        <div>
          <p class="text-sm text-gray-600 mb-4">
            文档：<span class="font-medium">{{ documentTitle }}</span>
          </p>
        </div>

        <!-- 已创建分享 -->
        <div
          v-if="shareId"
          class="space-y-4"
        >
          <div class="bg-green-50 border border-green-200 rounded-lg p-4">
            <p class="text-sm text-green-800 mb-2">
              ✓ 分享链接已创建
            </p>
            <div class="flex items-center gap-2 bg-white rounded px-3 py-2">
              <input
                :value="shareUrl"
                readonly
                class="flex-1 text-sm text-gray-700 outline-none"
              />
              <button
                @click="copyShareLink"
                class="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                复制
              </button>
            </div>
          </div>

        </div>

        <!-- 创建分享表单 -->
        <form
          v-else
          id="share-form"
          class="space-y-4"
        >
          <!-- 密码设置 -->
          <div>
            <label
              for="password"
              class="block text-sm font-medium text-gray-700 mb-2"
            >
              访问密码（可选）
            </label>
            <UInput
              id="password"
              v-model="password"
              type="password"
              placeholder="留空则无需密码"
            />
            <p class="mt-1 text-xs text-gray-500">
              设置密码后，访问者需要输入密码才能查看文档
            </p>
          </div>

          <!-- 过期时间 -->
          <div>
            <label
              for="expires_at"
              class="block text-sm font-medium text-gray-700 mb-2"
            >
              过期时间（可选）
            </label>
            <UInput
              id="expires_at"
              v-model="expiresAt"
              type="datetime-local"
            />
            <p class="mt-1 text-xs text-gray-500">
              设置过期时间后，链接将在指定时间后失效
            </p>
          </div>

          <!-- 错误提示 -->
          <div
            v-if="error"
            class="bg-red-50 border border-red-200 rounded-lg p-3"
          >
            <p class="text-sm text-red-800">
              {{ error }}
            </p>
          </div>
        </form>
      </div>
    </template>

    <template #footer="{ close: closeModal }">
      <template v-if="!shareId">
        <UButton
          variant="soft"
          @click="closeModal"
        >
          取消
        </UButton>
        <UButton
          :loading="loading"
          type="submit"
          form="share-form"
          @click.prevent="createShare"
        >
          创建分享链接
        </UButton>
      </template>
      <template v-else>
        <UButton
          variant="soft"
          @click="reset"
        >
          创建新链接
        </UButton>
        <UButton
          @click="closeModal"
        >
          完成
        </UButton>
      </template>
    </template>
  </UModal>
</template>
