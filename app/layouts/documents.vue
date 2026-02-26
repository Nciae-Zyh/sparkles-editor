<script lang="ts" setup>
import { useAuth } from '~/composables/useAuth'
import { useSafeLocalePath } from '~/utils/safeLocalePath'
import { useDocuments } from '~/composables/useDocuments'

const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)
const actionsData = computed(() => $tm('actions') as Record<string, string> | undefined)
const appData = computed(() => $tm('app') as Record<string, string> | undefined)
const { user, fetchUser, logout, authInitialized } = useAuth()
const router = useRouter()
const route = useRoute()
const safeLocalePath = useSafeLocalePath()
const { createEmptyDocument } = useDocuments()

const currentFolderId = computed(() => route.query.folder as string | undefined)

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
  if (!user.value) {
    await navigateTo(safeLocalePath('/'))
  }
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
            {{ documentsData?.newDocument || '新建文档' }}
          </UButton>
          <UButton
            :to="safeLocalePath('/shares')"
            icon="i-lucide-link"
            variant="soft"
            size="sm"
          >
            {{ appData?.myShares || '我的分享' }}
          </UButton>
          <UButton
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
        </template>
        <div
          v-else
          class="skeleton-shimmer h-8 w-48 rounded-md"
        />
      </template>
    </AppHeader>

    <slot />
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
</template>
