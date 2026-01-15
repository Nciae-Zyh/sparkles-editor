<script lang="ts" setup>
import { useDocuments } from '~/composables/useDocuments'
import { useAuth } from '~/composables/useAuth'
import { useSafeLocalePath } from '~/utils/safeLocalePath'

definePageMeta({
  layout: 'editor'
})

const route = useRoute()
const router = useRouter()
const { user } = useAuth()
const { getDocument, loading } = useDocuments()
const safeLocalePath = useSafeLocalePath()

const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)

const documentId = computed(() => route.params.id as string)
const document = ref<any>(null)
const content = ref('')
const documentTitle = ref('')

onMounted(async () => {
  await nextTick()
  if (!user.value) {
    router.push(safeLocalePath('/'))
    return
  }

  try {
    const doc = await getDocument(documentId.value)
    document.value = doc
    content.value = doc.content || ''
    documentTitle.value = doc.title || (documentsData.value?.untitledDocument || '未命名文档')
    // 如果文档有父文件夹，设置到编辑器中
    if (doc.parent_id) {
      // 可以通过 props 传递给 MarkdownEditor
    }
  } catch (error) {
    console.error('Failed to load document:', error)
    router.push(safeLocalePath('/documents'))
  }
})
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

  <MarkdownEditor
    v-else
    v-model="content"
    :document-id="documentId"
    :document-title="documentTitle"
  />
</template>
