<script lang="ts" setup>
import { useAuth } from '~/composables/useAuth'
import { useSafeLocalePath } from '~/utils/safeLocalePath'

const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)
const { user, fetchUser } = useAuth()
const router = useRouter()
const route = useRoute()
const safeLocalePath = useSafeLocalePath()

const currentFolderId = computed(() => route.query.folder as string | undefined)

onMounted(async () => {
  await fetchUser()
  if (!user.value) {
    router.push(safeLocalePath('/'))
  }
})
</script>

<template>
  <div class="min-h-screen bg-white dark:bg-gray-900">
    <AppHeader>
      <template #default>
        <UButton
          :to="currentFolderId ? `${safeLocalePath('/')}?folder=${currentFolderId}` : safeLocalePath('/')"
          icon="i-lucide-plus"
          variant="soft"
          size="sm"
        >
          {{ documentsData?.newDocument || '新建文档' }}
        </UButton>
        <UButton
          :to="safeLocalePath('/documents')"
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
