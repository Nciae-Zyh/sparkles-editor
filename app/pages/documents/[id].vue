<script lang="ts" setup>
import { useDocuments } from '~/composables/useDocuments'
import { useAuth } from '~/composables/useAuth'
import { useSafeLocalePath } from '~/utils/safeLocalePath'

definePageMeta({
  layout: 'editor'
})

const route = useRoute()
const router = useRouter()
const { user, fetchUser, loading: authLoading } = useAuth()
const { getDocument, loading, renameDocument } = useDocuments()
const safeLocalePath = useSafeLocalePath()

const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)

const documentId = computed(() => route.params.id as string)
const document = ref<any>(null)
const content = ref('')
const documentTitle = ref('')
const isReadOnly = ref(false) // 是否只读模式（文档不属于当前用户）
const isRenaming = ref(false) // 是否正在重命名
const renameInput = ref('')
const isRenamingLoading = ref(false) // 重命名加载状态

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
    documentTitle.value = doc.title || (documentsData.value?.untitledDocument || '未命名文档')

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
  }

  // 订阅文档树的重命名通知
  const nuxtApp = useNuxtApp()
  if (nuxtApp.$subscribeNotification) {
    const unsubscribe = nuxtApp.$subscribeNotification<{ id: string, title: string }>('document:renamed', (payload) => {
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
    alert(documentsData.value?.pleaseEnterTitle || '请输入文档名称')
    return
  }

  if (renameInput.value.trim() === documentTitle.value) {
    cancelRename()
    return
  }

  const newTitle = renameInput.value.trim()
  
  // 验证标题不能包含路径分隔符
  if (newTitle.includes('/') || newTitle.includes('\\')) {
    alert(documentsData.value?.titleCannotContainPath || '标题不能包含路径分隔符（/ 或 \\）')
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
    if (nuxtApp.$publishNotification) {
      nuxtApp.$publishNotification('document:renamed', {
        id: documentId.value,
        title: newTitle
      })
    }
    // 注意：重命名后，originalDocumentTitle 会在 MarkdownEditor 中通过 watch 自动更新
  } catch (error: any) {
    console.error('重命名失败:', error)
    alert(error.message || documentsData.value?.renameFailed || '重命名失败，请稍后重试')
  } finally {
    isRenamingLoading.value = false
  }
}
</script>

<template>
  <div class="flex-1 overflow-hidden">
    <div
      v-if="loading && !document"
      class="flex justify-center items-center min-h-screen"
    >
      <UIcon
        name="i-lucide-loader-2"
        class="w-8 h-8 animate-spin"
      />
    </div>
    <MarkdownEditor
      v-else
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
      @update:rename-input="(val) => { renameInput = val }"
    />
  </div>
</template>
