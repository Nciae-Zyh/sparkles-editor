<script lang="ts" setup>
import { useDocuments } from '~/composables/useDocuments'
import { useAuth } from '~/composables/useAuth'
import { useSafeLocalePath } from '~/utils/safeLocalePath'
import type { Document } from '~/types'

const { tm: $tm, t } = useI18n()

definePageMeta({
  layout: 'editor'
})

const route = useRoute()
const { user, fetchUser } = useAuth()
const { getDocument, renameDocument } = useDocuments()
const safeLocalePath = useSafeLocalePath()

const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)

const documentId = computed(() => route.params.id as string)
const document = ref<(Document & { content?: string }) | null>(null)
const content = ref('')
const pageLoading = ref(true)
const documentTitle = ref('')
const isReadOnly = ref(false) // 是否只读模式（文档不属于当前用户）
const isRenaming = ref(false) // 是否正在重命名
const renameInput = ref('')
const isRenamingLoading = ref(false) // 重命名加载状态
const showShareModal = ref(false) // 是否显示分享模态框

onMounted(async () => {
  // 等待用户认证加载完成
  await fetchUser()

  // 如果用户未登录，跳转到首页
  if (!user.value) {
    await navigateTo(safeLocalePath('/'))
    return
  }

  try {
    const doc = await getDocument(documentId.value)
    document.value = doc
    content.value = doc.content || ''
    documentTitle.value = doc.title || (documentsData.value?.untitledDocument || t('documents.untitledDocument'))

    // 检查文档是否属于当前用户
    if (doc.user_id && user.value && doc.user_id !== user.value.id) {
      // 文档不属于当前用户，设置为只读模式
      isReadOnly.value = true
    } else {
      isReadOnly.value = false
    }

    // 如果文档有父文件夹，设置到编辑器中
    if (doc.parent_id) {
      // 可以通过 props 传递给 MarkdownEditor
    }
  } catch (error) {
    console.error('Failed to load document:', error)
    await navigateTo(safeLocalePath('/documents'))
  } finally {
    pageLoading.value = false
  }

  // 订阅文档树的重命名通知
  const nuxtApp = useNuxtApp()
  type SubscribeFn = <T>(eventName: string, handler: (payload: T) => void) => () => void
  const subscribeNotification = nuxtApp.$subscribeNotification as SubscribeFn | undefined
  if (subscribeNotification) {
    const unsubscribe = subscribeNotification<{ id: string, title: string }>('document:renamed', (payload) => {
      // 如果重命名的是当前文档，更新标题
      if (payload && payload.id === documentId.value) {
        documentTitle.value = payload.title
        if (document.value) {
          document.value.title = payload.title
        }
      }
    })

    // 组件卸载时取消订阅
    onUnmounted(() => {
      unsubscribe()
    })
  }
})

// 开始重命名
const startRename = () => {
  if (isReadOnly.value) return
  renameInput.value = documentTitle.value
  isRenaming.value = true
}

// 取消重命名
const cancelRename = () => {
  isRenaming.value = false
  renameInput.value = ''
}

// 保存重命名
const saveRename = async () => {
  if (!renameInput.value.trim()) {
    alert(documentsData.value?.pleaseEnterTitle || t('documents.pleaseEnterTitle'))
    return
  }

  if (renameInput.value.trim() === documentTitle.value) {
    cancelRename()
    return
  }

  const newTitle = renameInput.value.trim()

  // 验证标题不能包含路径分隔符
  if (newTitle.includes('/') || newTitle.includes('\\')) {
    alert(documentsData.value?.titleCannotContainPath || t('documents.titleCannotContainPath'))
    return
  }

  try {
    isRenamingLoading.value = true
    await renameDocument(documentId.value, newTitle)
    documentTitle.value = newTitle
    // 更新文档对象
    if (document.value) {
      document.value.title = newTitle
    }
    cancelRename()

    // 发布重命名通知，通知文档树更新
    const nuxtApp = useNuxtApp()
    const publishNotification = nuxtApp.$publishNotification as ((eventName: string, payload?: unknown) => void) | undefined
    if (publishNotification) {
      publishNotification('document:renamed', {
        id: documentId.value,
        title: newTitle
      })
    }
    // 注意：重命名后，originalDocumentTitle 会在 MarkdownEditor 中通过 watch 自动更新
  } catch (error: unknown) {
    console.error('重命名失败:', error)
    const message = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message || '') : ''
    alert(message || documentsData.value?.renameFailedRetry || documentsData.value?.renameFailed || t('documents.renameFailed'))
  } finally {
    isRenamingLoading.value = false
  }
}

const handleRenameInputUpdate = (value: string) => {
  renameInput.value = value
}
</script>

<template>
  <div class="flex-1 overflow-hidden flex flex-col">
    <Transition
      name="fade"
      mode="out-in"
    >
      <div
        v-if="pageLoading"
        key="skeleton"
        class="flex flex-col h-full"
      >
        <!-- 工具栏骨架 -->
        <div class="skeleton-shimmer h-11 border-b border-default shrink-0" />
        <!-- 标题骨架 -->
        <div class="px-8 pt-8 pb-4 shrink-0">
          <div class="skeleton-shimmer h-9 w-72 rounded-md" />
        </div>
        <!-- 内容行骨架 -->
        <div class="px-8 flex flex-col gap-3">
          <div class="skeleton-shimmer h-4 w-full rounded" />
          <div class="skeleton-shimmer h-4 w-5/6 rounded" />
          <div class="skeleton-shimmer h-4 w-4/5 rounded" />
          <div class="skeleton-shimmer h-4 w-3/4 rounded" />
          <div class="skeleton-shimmer h-4 w-full rounded" />
          <div class="skeleton-shimmer h-4 w-2/3 rounded" />
        </div>
      </div>
      <MarkdownEditor
        v-else
        key="editor"
        v-model="content"
        :document-id="documentId"
        :document-title="documentTitle"
        :readonly="isReadOnly"
        :is-renaming="isRenaming"
        :rename-input="renameInput"
        :rename-loading="isRenamingLoading"
        @start-rename="startRename"
        @save-rename="saveRename"
        @cancel-rename="cancelRename"
        @update:rename-input="handleRenameInputUpdate"
      />
    </Transition>

    <!-- 分享模态框 -->
    <DocumentsShareDocumentModal
      v-if="document"
      v-model:open="showShareModal"
      :document-id="documentId"
      :document-title="documentTitle"
    />
  </div>
</template>
