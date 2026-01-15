<script lang="ts" setup>
import { useAuth } from '~/composables/useAuth'
import { useDocuments } from '~/composables/useDocuments'

const route = useRoute()
const router = useRouter()
const { user, fetchUser } = useAuth()
const { getDocument, loading } = useDocuments()

const documentId = computed(() => route.params.id as string)
const document = ref<any>(null)
const content = ref('')
const documentTitle = ref('')

onMounted(async () => {
  await fetchUser()
  if (!user.value) {
    router.push('/')
    return
  }

  try {
    const doc = await getDocument(documentId.value)
    document.value = doc
    content.value = doc.content || ''
    documentTitle.value = doc.title || '未命名文档'
  } catch (error) {
    console.error('Failed to load document:', error)
    router.push('/documents')
  }
})
</script>

<template>
  <div v-if="loading && !document" class="flex justify-center items-center min-h-screen">
    <UIcon
      name="i-lucide-loader-2"
      class="w-8 h-8 animate-spin"
    />
  </div>

  <div v-else>
    <AppHeader>
      <template #right>
        <UButton
          to="/documents"
          icon="i-lucide-arrow-left"
          variant="soft"
          size="sm"
        >
          返回
        </UButton>
        <UButton
          to="/"
          icon="i-lucide-plus"
          variant="soft"
          size="sm"
        >
          新建文档
        </UButton>
      </template>
    </AppHeader>

    <MarkdownEditor
      v-model="content"
      :document-id="documentId"
      :document-title="documentTitle"
    />
  </div>
</template>
