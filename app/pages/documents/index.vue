<script lang="ts" setup>
import { useAuth } from '~/composables/useAuth'
import { useDocuments } from '~/composables/useDocuments'

const { user, fetchUser } = useAuth()
const router = useRouter()
const route = useRoute()

const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)

const currentFolderId = computed(() => route.query.folder as string | undefined)

onMounted(async () => {
  await fetchUser()
  if (!user.value) {
    router.push('/')
  }
})
</script>

<template>
  <div class="min-h-screen bg-white dark:bg-gray-900">
    <AppHeader>
      <template #default>
        <UButton
          :to="currentFolderId ? `/?folder=${currentFolderId}` : '/'"
          icon="i-lucide-plus"
          variant="soft"
          size="sm"
        >
          {{ documentsData?.newDocument || '新建文档' }}
        </UButton>
        <UButton
          :to="'/documents'"
          icon="i-lucide-user"
          variant="soft"
          size="sm"
        >
          {{ user?.name || user?.email }}
        </UButton>
      </template>
    </AppHeader>

    <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div class="flex items-center gap-4 mb-6">
        <UButton
          v-if="currentFolderId"
          icon="i-lucide-arrow-left"
          variant="ghost"
          size="sm"
          @click="router.push('/documents')"
        >
          {{ documentsData?.back || '返回' }}
        </UButton>
        <h1 class="text-2xl font-bold">
          {{ documentsData?.myDocuments || '我的文档' }}
        </h1>
      </div>
      <DocumentsDocumentTree />
    </div>
  </div>
</template>
