<script lang="ts" setup>
const editorData = computed(() => $tm('editor') as Record<string, string> | undefined)
const route = useRoute()
const router = useRouter()

// Default content - only used when Y.js document is empty
const defaultContent = computed(() => {
  return editorData.value?.defaultContent || ''
})

// 使用 ref 定义内容，并设置默认值
const content = ref<string>('')
const isNewDocument = ref(false) // 首页默认是预览模式
const allowSave = ref(false) // 是否允许保存
const newDocumentId = ref<string | undefined>(undefined) // 新建文档时的唯一ID

// 检查 URL 参数，判断是否是新文档
const checkNewDocument = () => {
  const newId = route.query.new as string | undefined
  if (newId) {
    content.value = ''
    isNewDocument.value = true
    allowSave.value = true
    newDocumentId.value = newId
    // 清除 URL 参数，但保持在同一页面
    router.replace({ query: {} })
  }
}

// 监听语言变化，更新默认内容（新文档不设置默认内容）
watch(editorData, () => {
  if (!content.value && !isNewDocument.value) {
    content.value = defaultContent.value
  }
}, { deep: true })

// 监听路由变化
watch(() => route.query.new, () => {
  checkNewDocument()
})

onMounted(() => {
  // 如果是新文档，保持空内容，不设置默认内容
  if (!content.value && !isNewDocument.value) {
    content.value = defaultContent.value
  }
  checkNewDocument()
})
</script>

<template>
  <MarkdownEditor
    v-model="content"
    :enable-before-unload="false"
    :readonly="!allowSave"
    :allow-save="allowSave"
    :document-id="newDocumentId"
    @document-saved="(id) => {
      isNewDocument = false
      allowSave.value = false // 保存后恢复预览模式
      newDocumentId.value = undefined // 清除临时ID
    }"
  />
</template>
