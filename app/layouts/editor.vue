<script lang="ts" setup>
import { useAuth } from '~/composables/useAuth'
import { useSafeLocalePath } from '~/utils/safeLocalePath'

const appData = computed(() => $tm('app') as Record<string, string> | undefined)
const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)
const { user, fetchUser } = useAuth()
const router = useRouter()
const safeLocalePath = useSafeLocalePath()

onMounted(async () => {
  await fetchUser()
  if (!user.value) {
    await navigateTo(safeLocalePath('/'))
  }
})
</script>

<template>
  <div class="flex flex-col h-screen overflow-hidden">
    <AppHeader>
      <template #default>
        <slot name="header-actions">
          <UButton
            :to="safeLocalePath('/documents')"
            icon="i-lucide-arrow-left"
            variant="soft"
            size="sm"
          >
            {{ documentsData?.back || '返回' }}
          </UButton>
          <UButton
            :to="safeLocalePath('/')"
            icon="i-lucide-plus"
            variant="soft"
            size="sm"
          >
            {{ documentsData?.newDocument || '新建文档' }}
          </UButton>
        </slot>
      </template>
    </AppHeader>
    <div class="flex-1 min-h-0 flex overflow-hidden">
      <div class="h-full flex flex-1">
<!--        TODO: 将可选择展开和缩起的文件Tree列表菜单，但是在移动端把这部分设置为USlideover的表现形式。触发位置都在顶部菜单的左侧标题位置 -->
        <slot />
      </div>
    </div>
  </div>
</template>
