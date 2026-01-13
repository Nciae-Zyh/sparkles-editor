<script lang="ts" setup>
const editorData = computed(() => $tm('editor') as Record<string, string> | undefined)

// Default content - only used when Y.js document is empty
const defaultContent = computed(() => {
  return editorData.value?.defaultContent || ''
})

// 使用 defineModel 定义内容，并设置默认值
const content = defineModel<string>('')

// 监听语言变化，更新默认内容
watch(editorData, () => {
  if (!content.value) {
    content.value = defaultContent.value
  }
}, { deep: true })
onMounted(() => {
  content.value = defaultContent.value
  console.log(content.value)
})
</script>

<template>
  <MarkdownEditor v-model="content" />
</template>
