<script lang="ts" setup>
import { useAuth } from '~/composables/useAuth'
import { useSafeLocalePath } from '~/utils/safeLocalePath'
import { useDocuments } from '~/composables/useDocuments'

const appData = computed(() => $tm('app') as Record<string, string> | undefined)
const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)
const actionsData = computed(() => $tm('actions') as Record<string, string> | undefined)
const { user, fetchUser, logout } = useAuth()
const router = useRouter()
const route = useRoute()
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

onMounted(async () => {
  await fetchUser()
})
const openLeft = ref(false)
</script>

<template>
  <div class="flex flex-col h-screen overflow-hidden">
    <AppHeader>
      <div class="flex items-center gap-2">
        <UTooltip
          v-if="user && (appData?.newDocument || '新建文档').length > 10"
          :text="appData?.newDocument || '新建文档'"
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
          {{ appData?.newDocument || '新建文档' }}
        </UButton>
        <UTooltip
          v-if="user && (appData?.myDocuments || '我的文档').length > 10"
          :text="appData?.myDocuments || '我的文档'"
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
          {{ appData?.myDocuments || '我的文档' }}
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
          {{ appData?.login || '登录' }}
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
