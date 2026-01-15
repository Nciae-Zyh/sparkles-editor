<script lang="ts" setup>
import { useAuth } from '~/composables/useAuth'

const appData = computed(() => $tm('app') as Record<string, string> | undefined)
const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)
const { user, fetchUser } = useAuth()
const router = useRouter()

onMounted(async () => {
  await fetchUser()
  if (!user.value) {
    router.push('/')
  }
})
</script>

<template>
  <div>
    <AppHeader>
      <template #default>
        <slot name="header-actions">
          <UButton
            to="/documents"
            icon="i-lucide-arrow-left"
            variant="soft"
            size="sm"
          >
            {{ documentsData?.back || '返回' }}
          </UButton>
          <UButton
            to="/"
            icon="i-lucide-plus"
            variant="soft"
            size="sm"
          >
            {{ documentsData?.newDocument || '新建文档' }}
          </UButton>
        </slot>
      </template>
    </AppHeader>

    <slot />
  </div>
</template>
