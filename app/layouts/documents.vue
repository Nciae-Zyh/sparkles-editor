<script lang="ts" setup>
import { useAuth } from '~/composables/useAuth'
import { useSafeLocalePath } from '~/utils/safeLocalePath'
import { useDocuments } from '~/composables/useDocuments'

const { tm: $tm, t } = useI18n()

const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)
const actionsData = computed(() => $tm('actions') as Record<string, string> | undefined)
const appData = computed(() => $tm('app') as Record<string, string> | undefined)
const { user, fetchUser, logout, authInitialized } = useAuth()
const safeLocalePath = useSafeLocalePath()
const { createEmptyDocument } = useDocuments()

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

onMounted(async () => {
  await fetchUser()
  if (!user.value) {
    await navigateTo(safeLocalePath('/'))
  }
})

// 用户下拉菜单
const userMenuItems = computed(() => {
  const items: Array<{ label: string; icon: string; to?: string; onSelect?: () => void }> = [
    {
      label: appData.value?.myShares || t('app.myShares'),
      icon: 'i-lucide-link',
      to: safeLocalePath('/shares')
    }
  ]
  if (user.value) {
    items.push({
      label: appData.value?.logout || t('app.logout'),
      icon: 'i-lucide-log-out',
      onSelect: async () => { await logout(); await navigateTo(safeLocalePath('/')) }
    })
  }
  return items
})
</script>

<template>
  <div class="min-h-screen bg-default">
    <AppHeader>
      <template #default>
        <template v-if="authInitialized">
          <UButton
            icon="i-lucide-plus"
            variant="soft"
            size="sm"
            @click="createNewDocument"
          >
            <span class="hidden sm:inline">{{ documentsData?.newDocument || t('documents.newDocument') }}</span>
          </UButton>
          <UDropdownMenu
            :items="userMenuItems"
            :content="{ align: 'end' }"
          >
            <UButton
              icon="i-lucide-user"
              variant="ghost"
              size="sm"
              :label="user?.name || user?.email"
            />
          </UDropdownMenu>
        </template>
        <div
          v-else
          class="skeleton-shimmer h-8 w-48 rounded-md"
        />
      </template>
    </AppHeader>

    <slot />

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
