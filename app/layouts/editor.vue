<script lang="ts" setup>
import { useAuth } from '~/composables/useAuth'
import { useSafeLocalePath } from '~/utils/safeLocalePath'
import { useMediaQuery } from '@vueuse/core'

const appData = computed(() => $tm('app') as Record<string, string> | undefined)
const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)
const { user, fetchUser } = useAuth()
const router = useRouter()
const safeLocalePath = useSafeLocalePath()

// 文档树显示状态
const isDocumentTreeOpen = ref(false)
const isDocumentTreeCollapsed = ref(false) // 桌面端侧边栏折叠状态

// 响应式检测：移动端使用 Slideover，桌面端使用侧边栏
const isMobile = useMediaQuery('(max-width: 1023px)') // lg breakpoint

// 切换文档树显示
const toggleDocumentTree = () => {
  if (isMobile.value) {
    // 移动端：切换 Slideover
    isDocumentTreeOpen.value = !isDocumentTreeOpen.value
  } else {
    // 桌面端：切换侧边栏折叠状态
    isDocumentTreeCollapsed.value = !isDocumentTreeCollapsed.value
  }
}

// 关闭移动端 Slideover
const closeSlideover = () => {
  isDocumentTreeOpen.value = false
}

onMounted(async () => {
  await fetchUser()
  if (!user.value) {
    await navigateTo(safeLocalePath('/'))
  }
})
</script>

<template>
  <div class="flex flex-col h-screen overflow-hidden">
    <AppHeader @toggle-document-tree="toggleDocumentTree">
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
      <!-- 桌面端：可折叠侧边栏 -->
      <aside
        :class="[
          'hidden lg:flex flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 transition-all duration-300 overflow-hidden',
          isDocumentTreeCollapsed ? 'w-0' : 'w-80'
        ]"
      >
        <div
          v-if="!isDocumentTreeCollapsed"
          class="flex-1 overflow-y-auto"
        >
          <DocumentsDocumentTreeWithDragDrop :compact="true" />
        </div>
      </aside>

      <!-- 移动端：Slideover -->
      <USlideover
        v-model:open="isDocumentTreeOpen"
        side="left"
        :title="documentsData?.documentTree || '文档树'"
        class="lg:hidden"
      >
        <template #body>
          <div class="h-full overflow-y-auto">
            <DocumentsDocumentTree />
          </div>
        </template>
      </USlideover>

      <!-- 主内容区域 -->
      <div class="h-full flex flex-1 min-w-0">
        <slot />
      </div>
    </div>
  </div>
</template>
