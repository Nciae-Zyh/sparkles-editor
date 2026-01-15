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

onMounted(async () => {
  // 等待用户认证加载完成
  await fetchUser()
  
  // 如果用户未登录，跳转到首页
  if (!user.value) {
    router.push(safeLocalePath('/'))
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
    router.push(safeLocalePath('/documents'))
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

  try {
    await renameDocument(documentId.value, renameInput.value.trim())
    documentTitle.value = renameInput.value.trim()
    // 更新文档对象
    if (document.value) {
      document.value.title = renameInput.value.trim()
    }
    cancelRename()
  } catch (error: any) {
    console.error('重命名失败:', error)
    alert(error.message || documentsData.value?.renameFailed || '重命名失败，请稍后重试')
  }
}
</script>

<template>
  <div
    v-if="loading && !document"
    class="flex justify-center items-center min-h-screen"
  >
    <UIcon
      name="i-lucide-loader-2"
      class="w-8 h-8 animate-spin"
    />
  </div>

  <div v-else>
    <!-- 文档标题栏 -->
    <div class="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 px-4 sm:px-6 lg:px-14 py-3">
      <div class="flex items-center gap-2 max-w-4xl mx-auto">
        <div
          v-if="!isRenaming"
          class="flex items-center gap-2 flex-1 min-w-0"
        >
          <h1 class="text-lg sm:text-xl font-semibold truncate">
            {{ documentTitle }}
          </h1>
          <UButton
            v-if="!isReadOnly"
            icon="i-lucide-pencil"
            size="xs"
            variant="ghost"
            @click="startRename"
          />
        </div>
        <div
          v-else
          class="flex items-center gap-2 flex-1"
        >
          <UInput
            v-model="renameInput"
            class="flex-1"
            autofocus
            @keyup.enter="saveRename"
            @keyup.esc="cancelRename"
          />
          <UButton
            icon="i-lucide-check"
            size="xs"
            color="primary"
            @click="saveRename"
          />
          <UButton
            icon="i-lucide-x"
            size="xs"
            variant="ghost"
            @click="cancelRename"
          />
        </div>
      </div>
    </div>

    <!-- 编辑器 -->
    <MarkdownEditor
      v-model="content"
      :document-id="documentId"
      :document-title="documentTitle"
      :readonly="isReadOnly"
    />
  </div>
</template>
