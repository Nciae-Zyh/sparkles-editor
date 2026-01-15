<script lang="ts" setup>
import { generateDocumentId } from '~/utils/documentId'

const route = useRoute()
const router = useRouter()

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
    router.replace({ query: {} })
  }
}

// 监听路由变化
watch(() => route.query.function, () => {
  checkCreateDocument()
})

onMounted(() => {
  checkCreateDocument()
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
