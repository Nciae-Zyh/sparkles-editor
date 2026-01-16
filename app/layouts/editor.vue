<script lang="ts" setup>
import { useAuth } from '~/composables/useAuth'
import { useSafeLocalePath } from '~/utils/safeLocalePath'
import { useMediaQuery } from '@vueuse/core'
import { useDocuments } from '~/composables/useDocuments'

const appData = computed(() => $tm('app') as Record<string, string> | undefined)
const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)
const actionsData = computed(() => $tm('actions') as Record<string, string> | undefined)
const { user, fetchUser, logout } = useAuth()
const router = useRouter()
const safeLocalePath = useSafeLocalePath()
const { createEmptyDocument } = useDocuments()

// 文档树显示状态
const isDocumentTreeOpen = ref(false)
const isDocumentTreeCollapsed = ref(false) // 桌面端侧边栏折叠状态

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
    alert(documentsData.value?.enterDocumentName || '请输入文档名称')
    return
  }

  try {
    creatingDocument.value = true
    const document = await createEmptyDocument(newDocumentName.value.trim())
    newDocumentName.value = ''
    showCreateDocument.value = false
    
    // 跳转到新创建的文档编辑页面
    await navigateTo(`${safeLocalePath('/documents')}/${document.id}`)
  } catch (error: any) {
    alert(error.message || documentsData.value?.createDocumentFailed || '创建文档失败')
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
            icon="i-lucide-plus"
            variant="soft"
            size="sm"
            @click="createNewDocument"
          >
            {{ documentsData?.newDocument || '新建文档' }}
          </UButton>
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
            {{ appData?.logout || '退出' }}
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

    <!-- 创建文档模态框 -->
    <UModal
      v-model:open="showCreateDocument"
      :title="documentsData?.newDocument || '新建文档'"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <UFormField
          :label="documentsData?.documentName || '文档名称'"
          name="documentName"
          required
        >
          <UInput
            v-model="newDocumentName"
            :placeholder="documentsData?.enterDocumentName || '请输入文档名称'"
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
          {{ actionsData?.cancel || '取消' }}
        </UButton>
        <UButton
          :loading="creatingDocument"
          @click="handleCreateDocument"
        >
          {{ documentsData?.create || '创建' }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
