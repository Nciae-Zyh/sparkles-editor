<script lang="ts" setup>
import { useAuth } from '~/composables/useAuth'
import { useSafeLocalePath } from '~/utils/safeLocalePath'
import { useMediaQuery, useLocalStorage } from '@vueuse/core'
import { useDocuments } from '~/composables/useDocuments'
import { useFocusMode } from '~/composables/useFocusMode'

const { tm: $tm, t } = useI18n()

const appData = computed(() => $tm('app') as Record<string, string> | undefined)
const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)
const actionsData = computed(() => $tm('actions') as Record<string, string> | undefined)
const { user, fetchUser, logout, authInitialized } = useAuth()
const safeLocalePath = useSafeLocalePath()
const { createEmptyDocument } = useDocuments()
const { isFocusMode } = useFocusMode()

// 文档树显示状态
const isDocumentTreeOpen = ref(false)
const isDocumentTreeCollapsed = useLocalStorage('editor:sidebar-collapsed', false) // 桌面端侧边栏折叠状态（持久化）

// 响应式检测：移动端使用 Slideover，桌面端使用侧边栏
const isMobile = useMediaQuery('(max-width: 1023px)') // lg breakpoint

// 创建文档相关状态
const showCreateDocument = ref(false)
const newDocumentName = ref('')
const creatingDocument = ref(false)

// 新建文档函数 - 打开创建文档 Modal
const createNewDocument = () => {
  newDocumentName.value = ''
  showCreateDocument.value = true
}

// 处理创建文档
const handleCreateDocument = async () => {
  if (!newDocumentName.value.trim()) {
    alert(documentsData.value?.enterDocumentName || t('documents.enterDocumentName'))
    return
  }

  try {
    creatingDocument.value = true
    const document = await createEmptyDocument(newDocumentName.value.trim())
    newDocumentName.value = ''
    showCreateDocument.value = false

    // 跳转到新创建的文档编辑页面
    await navigateTo(`${safeLocalePath('/documents')}/${document.id}`)
  } catch (error: unknown) {
    const message = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message || '') : ''
    alert(message || documentsData.value?.createDocumentFailed || t('documents.createDocumentFailed'))
  } finally {
    creatingDocument.value = false
  }
}

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

onMounted(async () => {
  await fetchUser()
  if (!user.value) {
    await navigateTo(safeLocalePath('/'))
  }
})
</script>

<template>
  <div class="flex flex-col h-screen overflow-hidden">
    <AppHeader
      v-show="!isFocusMode"
      @toggle-document-tree="toggleDocumentTree"
    >
      <template #default>
        <slot name="header-actions">
          <UButton
            :to="safeLocalePath('/documents')"
            icon="i-lucide-arrow-left"
            variant="soft"
            size="sm"
          >
            {{ documentsData?.back || t('documents.back') }}
          </UButton>
          <UButton
            icon="i-lucide-plus"
            variant="soft"
            size="sm"
            @click="createNewDocument"
          >
            {{ documentsData?.newDocument || t('documents.newDocument') }}
          </UButton>
          <template v-if="authInitialized">
            <UButton
              v-if="user"
              :to="safeLocalePath('/documents')"
              icon="i-lucide-user"
              variant="soft"
              size="sm"
            >
              {{ user?.name || user?.email }}
            </UButton>
            <UButton
              v-if="user"
              icon="i-lucide-log-out"
              variant="soft"
              color="error"
              size="sm"
              @click="async () => { await logout(); await navigateTo(safeLocalePath('/')) }"
            >
              {{ appData?.logout || t('app.logout') }}
            </UButton>
          </template>
          <div
            v-else
            class="skeleton-shimmer h-8 w-32 rounded-md"
          />
        </slot>
      </template>
    </AppHeader>
    <div class="flex-1 min-h-0 flex overflow-hidden">
      <!-- 桌面端：可折叠侧边栏 -->
      <aside
        :class="[
          'hidden lg:flex flex-col border-r border-default bg-default transition-all duration-300 overflow-hidden',
          (isDocumentTreeCollapsed || isFocusMode) ? 'w-0' : 'w-80'
        ]"
      >
        <div
          v-show="!isDocumentTreeCollapsed"
          class="flex-1 overflow-y-auto"
        >
          <DocumentsDocumentTreeWithDragDrop :compact="true" />
        </div>
      </aside>

      <!-- 移动端：Slideover -->
      <USlideover
        v-model:open="isDocumentTreeOpen"
        side="left"
        :title="documentsData?.documentTree || t('documents.documentTree')"
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

    <!-- 创建文档模态框 -->
    <UModal
      v-model:open="showCreateDocument"
      :title="documentsData?.newDocument || t('documents.newDocument')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <UFormField
          :label="documentsData?.documentName || t('documents.documentName')"
          name="documentName"
          required
        >
          <UInput
            v-model="newDocumentName"
            :placeholder="documentsData?.enterDocumentName || t('documents.enterDocumentName')"
            @keyup.enter="handleCreateDocument"
          />
        </UFormField>
      </template>

      <template #footer="{ close }">
        <UButton
          color="neutral"
          variant="ghost"
          @click="close"
        >
          {{ actionsData?.cancel || t('actions.cancel') }}
        </UButton>
        <UButton
          :loading="creatingDocument"
          @click="handleCreateDocument"
        >
          {{ documentsData?.create || t('documents.create') }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
