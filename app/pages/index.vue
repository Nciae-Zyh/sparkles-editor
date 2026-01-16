<script lang="ts" setup>
import { generateDocumentId } from '~/utils/documentId'
import { useSafeLocalePath } from '~/utils/safeLocalePath'
import { useAuth } from '~/composables/useAuth'

const route = useRoute()
const safeLocalePath = useSafeLocalePath()
const { user } = useAuth()

// 使用 ref 定义内容
const content = ref<string>('')
const isNewDocument = ref(false) // 首页默认是预览模式
const allowSave = ref(false) // 是否允许保存
const newDocumentId = ref<string | undefined>(undefined) // 新建文档时的唯一ID

// 检查 URL 参数，判断是否是创建新文档
const checkCreateDocument = () => {
  const functionParam = route.query.function as string | undefined
  if (functionParam === 'create') {
    content.value = ''
    isNewDocument.value = true
    allowSave.value = true
    newDocumentId.value = generateDocumentId()
    // 清除 URL 参数，但保持在同一页面
    navigateTo({ query: {} })
  }
}

// 处理导入后的状态切换
const handleImported = (importedContent: string) => {
  // 如果用户已登录，切换到编辑状态
  if (user.value) {
    isNewDocument.value = true
    allowSave.value = true
    newDocumentId.value = generateDocumentId()
    content.value = importedContent
  }
}

// 监听路由变化
watch(() => route.query.function, () => {
  checkCreateDocument()
})
const defaultContent = computed(() => $tm('editor.defaultContent'))
onMounted(() => {
  if (route.query && 'create' !== route.query.function) {
    try {
      content.value = defaultContent.value
    } catch (e) {
      console.error('初始化默认内容失败:', e)
    }
  }
  checkCreateDocument()
})
</script>

<template>
  <div class="flex-1 overflow-hidden">
    <MarkdownEditor
      v-model="content"
      :allow-save="allowSave"
      :document-id="newDocumentId"
      :enable-before-unload="false"
      @imported="handleImported"
      @document-saved="async (id) => {
        isNewDocument = false
        allowSave.value = false // 保存后恢复预览模式
        newDocumentId.value = undefined // 清除临时ID
        // 保存后跳转到文档编辑页面
        await navigateTo(safeLocalePath(`/documents/${id}`))
      }"
    />
  </div>
</template>
