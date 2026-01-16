<script lang="ts" setup>
import { useSafeLocalePath } from '~/utils/safeLocalePath'
import { CalendarDate, CalendarDateTime, parseDateTime } from '@internationalized/date'
import type { DateValue } from '@internationalized/date'
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

interface Props {
  documentId: string
  documentTitle: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
}>()

const safeLocalePath = useSafeLocalePath()
const sharesData = computed(() => $tm('shares') as Record<string, string> | undefined)
const actionsData = computed(() => $tm('actions') as Record<string, string> | undefined)

// 使用 defineModel 实现双向绑定
const open = defineModel<boolean>('open', { default: false })

// 监听 open 变化，当关闭时触发 close 事件
watch(open, (newVal) => {
  if (!newVal) {
    emit('close')
  }
})

const loading = ref(false)
const error = ref('')
const shareId = ref<string | null>(null)
const shareUrl = ref('')

// 表单 schema
const schema = z.object({
  password: z.string().optional(),
  expiresAt: z.custom<DateValue | null>().optional()
})

type FormSchema = z.output<typeof schema>

const state = reactive<{
  password?: string
  expiresAt?: DateValue | null
}>({
  password: undefined,
  expiresAt: undefined
})

// 创建分享
const createShare = async (event: FormSubmitEvent<FormSchema>) => {
  if (loading.value) return

  loading.value = true
  error.value = ''

  try {
    const body: any = {
      document_id: props.documentId
    }

    if (event.data.password?.trim()) {
      body.password = event.data.password.trim()
    }

    // 将 DateValue 转换为 ISO 字符串
    if (event.data.expiresAt) {
      let dateTime: CalendarDateTime
      if (event.data.expiresAt instanceof CalendarDate) {
        // 如果是 CalendarDate，转换为 CalendarDateTime（设置为当天的 23:59:59）
        dateTime = event.data.expiresAt.toDateTime({ hour: 23, minute: 59, second: 59 })
      } else if (event.data.expiresAt instanceof CalendarDateTime) {
        dateTime = event.data.expiresAt
      } else {
        // 其他类型，尝试转换
        dateTime = event.data.expiresAt as CalendarDateTime
      }
      // 转换为 ISO 字符串格式
      // 使用 Date 对象构建，然后转换为 ISO 字符串
      const date = new Date(
        dateTime.year,
        dateTime.month - 1,
        dateTime.day,
        dateTime.hour || 0,
        dateTime.minute || 0,
        dateTime.second || 0
      )
      body.expires_at = date.toISOString()
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
    error.value = err.data?.message || sharesData.value?.createShareFailed || '创建分享失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

// 复制分享链接
const copyShareLink = () => {
  navigator.clipboard.writeText(shareUrl.value).then(() => {
    alert(sharesData.value?.shareLinkCopied || '分享链接已复制到剪贴板')
  }).catch(() => {
    alert(sharesData.value?.copyFailed || '复制失败，请手动复制')
  })
}

// 关闭模态框
const close = () => {
  open.value = false
}

// 重置表单
const reset = () => {
  state.password = undefined
  state.expiresAt = undefined
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
    v-model:open="open"
    :title="sharesData?.shareDocument || '分享文档'"
    :ui="{ footer: 'justify-end' }"
  >
    <template #body>
      <div class="space-y-4">
        <div>
          <p class="text-sm text-toned mb-4">
            文档：<span class="font-medium">{{ documentTitle }}</span>
          </p>
        </div>

        <!-- 已创建分享 -->
        <div
          v-if="shareId"
          class="space-y-4"
        >
          <div class="bg-success/10 border border-success/20 rounded-lg p-4">
            <p class="text-sm text-success mb-2">
              ✓ {{ sharesData?.shareLinkCreated || '分享链接已创建' }}
            </p>
            <div class="flex items-center gap-2 bg-default rounded px-3 py-2">
              <input
                :value="shareUrl"
                readonly
                class="flex-1 text-sm text-default outline-none"
              />
              <button
                @click="copyShareLink"
                class="text-primary hover:text-primary/80 text-sm font-medium"
              >
                {{ sharesData?.copy || '复制' }}
              </button>
            </div>
          </div>

        </div>

        <!-- 创建分享表单 -->
        <UForm
          v-else
          ref="shareForm"
          :schema="schema"
          :state="state"
          class="space-y-4"
          @submit="createShare"
        >
          <UAlert
            v-if="error"
            color="error"
            variant="soft"
            :title="error"
          />

          <UFormField
            :label="sharesData?.accessPassword || '访问密码（可选）'"
            name="password"
          >
            <UInput
              v-model="state.password"
              type="password"
              :placeholder="sharesData?.passwordPlaceholder || '留空则无需密码'"
            />
            <template #description>
              <p class="text-xs text-muted">
                {{ sharesData?.passwordDescription || '设置密码后，访问者需要输入密码才能查看文档' }}
              </p>
            </template>
          </UFormField>

          <UFormField
            :label="sharesData?.expiresAt || '过期时间（可选）'"
            name="expiresAt"
          >
            <UInputDate
              v-model="state.expiresAt"
              :granularity="'minute'"
            />
            <template #description>
              <p class="text-xs text-muted">
                {{ sharesData?.expiresAtDescription || '设置过期时间后，链接将在指定时间后失效' }}
              </p>
            </template>
          </UFormField>

          <UButton
            type="submit"
            block
            :loading="loading"
            class="mt-4"
          >
            {{ sharesData?.createShareLink || '创建分享链接' }}
          </UButton>
        </UForm>
      </div>
    </template>

    <template #footer="{ close: closeModal }">
      <template v-if="!shareId">
        <UButton
          variant="soft"
          @click="closeModal"
        >
          {{ actionsData?.cancel || sharesData?.cancel || '取消' }}
        </UButton>
      </template>
      <template v-else>
        <UButton
          variant="soft"
          @click="reset"
        >
          {{ sharesData?.createNewLink || '创建新链接' }}
        </UButton>
        <UButton
          @click="closeModal"
        >
          {{ sharesData?.done || '完成' }}
        </UButton>
      </template>
    </template>
  </UModal>
</template>
