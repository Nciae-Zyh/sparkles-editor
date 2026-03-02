<script lang="ts" setup>
import { useAuth } from '~/composables/useAuth'
import { useSafeLocalePath } from '~/utils/safeLocalePath'
import { useDocuments } from '~/composables/useDocuments'

const { tm: $tm, t } = useI18n()

const appData = computed(() => $tm('app') as Record<string, string> | undefined)
const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)
const actionsData = computed(() => $tm('actions') as Record<string, string> | undefined)
const { user, fetchUser, logout, authInitialized } = useAuth()
const safeLocalePath = useSafeLocalePath()
const { createEmptyDocument } = useDocuments()

const authModalOpen = ref(false)
const authMode = ref<'login' | 'register'>('login')

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
})
</script>

<template>
  <div class="flex flex-col h-screen overflow-hidden">
    <AppHeader>
      <div class="flex items-center gap-2">
        <template v-if="authInitialized">
          <UTooltip
            v-if="user && (appData?.newDocument || t('app.newDocument')).length > 10"
            :text="appData?.newDocument || t('app.newDocument')"
          >
            <UButton
              icon="i-lucide-file-plus"
              variant="soft"
              size="sm"
              @click="createNewDocument"
            />
          </UTooltip>
          <UButton
            v-else-if="user"
            icon="i-lucide-file-plus"
            variant="soft"
            size="sm"
            @click="createNewDocument"
          >
            {{ appData?.newDocument || t('app.newDocument') }}
          </UButton>
          <UTooltip
            v-if="user && (appData?.myDocuments || t('app.myDocuments')).length > 10"
            :text="appData?.myDocuments || t('app.myDocuments')"
          >
            <UButton
              :to="safeLocalePath('/documents')"
              icon="i-lucide-folder"
              variant="soft"
              size="sm"
            />
          </UTooltip>
          <UButton
            v-else-if="user"
            :to="safeLocalePath('/documents')"
            icon="i-lucide-folder"
            variant="soft"
            size="sm"
          >
            {{ appData?.myDocuments || t('app.myDocuments') }}
          </UButton>
          <UButton
            v-if="user"
            :to="safeLocalePath('/documents')"
            icon="i-lucide-user"
            variant="soft"
            size="sm"
          >
            {{ user.name || user.email }}
          </UButton>
          <UButton
            v-if="!user"
            icon="i-lucide-log-in"
            variant="soft"
            size="sm"
            @click="() => { authMode = 'login'; authModalOpen = true }"
          >
            {{ appData?.login || t('app.login') }}
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
          class="skeleton-shimmer h-8 w-24 rounded-md"
        />
      </div>
    </AppHeader>
    <div class="flex-1 min-h-0 flex overflow-hidden">
      <div class="h-full flex flex-1">
        <slot />
      </div>
    </div>
    <AuthModal
      v-model:open="authModalOpen"
      :mode="authMode"
    />

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
