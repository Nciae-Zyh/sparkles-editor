<script lang="ts" setup>
import { useAuth } from '~/composables/useAuth'

const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)
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

    <slot />
  </div>
</template>
