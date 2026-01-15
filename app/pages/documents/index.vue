<script lang="ts" setup>
import { useAuth } from '~/composables/useAuth'
import { useDocuments } from '~/composables/useDocuments'

const { user, fetchUser } = useAuth()
const router = useRouter()
const route = useRoute()

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
      <template #right>
        <UButton
          to="/"
          icon="i-lucide-plus"
          variant="soft"
          size="sm"
        >
          新建文档
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
          返回
        </UButton>
        <h1 class="text-2xl font-bold">
          我的文档
        </h1>
      </div>
      <DocumentList :parent-id="currentFolderId" />
    </div>
  </div>
</template>
