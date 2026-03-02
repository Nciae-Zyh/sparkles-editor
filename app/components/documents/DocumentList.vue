<script lang="ts" setup>
import { useDocuments } from '~/composables/useDocuments'
import { useDocumentContextMenu } from '~/composables/useDocumentContextMenu'
import { useSafeLocalePath } from '~/utils/safeLocalePath'
import type { Document } from '~/types'

const { tm: $tm, t } = useI18n()

interface Props {
  parentId?: string
}

const props = defineProps<Props>()

const { documents, loading, fetchDocuments, deleteDocument, createFolder, createEmptyDocument, renameDocument } = useDocuments()
const safeLocalePath = useSafeLocalePath()

const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)
const actionsData = computed(() => $tm('actions') as Record<string, string> | undefined)

const getErrorMessage = (error: unknown) => {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') {
      return message
    }
  }
  return ''
}

const deletingId = ref<string | null>(null)
const currentParentId = ref(props.parentId)
const showCreateFolder = ref(false)
const newFolderName = ref('')
const creatingFolder = ref(false)

// 创建文档相关状态
const showCreateDocument = ref(false)
const newDocumentName = ref('')
const creatingDocument = ref(false)
const createDocumentParentId = ref<string | null>(null)

// 重命名相关状态
const showRenameModal = ref(false)
const renamingId = ref<string | null>(null)
const renamingName = ref('')
const renamingType = ref<'document' | 'folder'>('document')
const renaming = ref(false)

const folders = computed(() => documents.value.filter(d => d.type === 'folder'))
const files = computed(() => documents.value.filter(d => d.type === 'document'))

watch(() => props.parentId, (newParentId) => {
  currentParentId.value = newParentId
  fetchDocuments(newParentId)
})

onMounted(() => {
  fetchDocuments(currentParentId.value)
})

const handleDelete = async (id: string, event: Event) => {
  event.stopPropagation()
  const item = documents.value.find(d => d.id === id)
  const itemType = item?.type === 'folder' ? (documentsData.value?.folder || t('documents.folder')) : (documentsData.value?.document || t('documents.document'))
  const deleteConfirm = documentsData.value?.deleteConfirm?.replace('{type}', itemType) || t('documents.deleteConfirm', { type: itemType })
  const deleteWarning = item?.type === 'folder' ? (documentsData.value?.deleteFolderWarning || t('documents.deleteFolderWarning')) : ''

  if (!confirm(`${deleteConfirm}${deleteWarning}`)) {
    return
  }

  try {
    deletingId.value = id
    await deleteDocument(id)
  } catch (error: unknown) {
    alert(getErrorMessage(error) || documentsData.value?.deleteFailed || t('documents.deleteFailed'))
  } finally {
    deletingId.value = null
  }
}

const handleCreateFolder = async () => {
  if (!newFolderName.value.trim()) {
    alert(documentsData.value?.enterFolderName || t('documents.enterFolderName'))
    return
  }

  try {
    creatingFolder.value = true
    const savedParentId = currentParentId.value // 保存 parentId
    await createFolder(newFolderName.value.trim(), savedParentId)
    newFolderName.value = ''
    showCreateFolder.value = false
    // 刷新文档列表以显示新创建的文件夹
    await fetchDocuments(savedParentId)
  } catch (error: unknown) {
    alert(getErrorMessage(error) || documentsData.value?.createFolderFailed || t('documents.createFolderFailed'))
  } finally {
    creatingFolder.value = false
  }
}

const navigateToFolder = async (folderId: string) => {
  await navigateTo(`${safeLocalePath('/documents')}?folder=${folderId}`)
}

const formatDate = (timestamp: number) => {
  const date = new Date(timestamp * 1000)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 处理重命名
const handleRename = async () => {
  if (!renamingId.value || !renamingName.value.trim()) {
    alert(documentsData.value?.enterNewName || t('documents.enterNewName'))
    return
  }

  try {
    renaming.value = true
    await renameDocument(renamingId.value, renamingName.value.trim())
    renamingId.value = null
    renamingName.value = ''
    showRenameModal.value = false
  } catch (error: unknown) {
    alert(getErrorMessage(error) || documentsData.value?.renameFailed || t('documents.renameFailed'))
  } finally {
    renaming.value = false
  }
}

// 打开重命名模态框
const openRenameModal = (item: Document) => {
  renamingId.value = item.id
  renamingName.value = item.title
  renamingType.value = item.type
  showRenameModal.value = true
}

// 创建新文档（空文档）
const handleCreateDocument = async () => {
  if (!newDocumentName.value.trim()) {
    alert(documentsData.value?.enterDocumentName || t('documents.enterDocumentName'))
    return
  }

  try {
    creatingDocument.value = true
    const savedParentId = createDocumentParentId.value // 保存 parentId
    const document = await createEmptyDocument(newDocumentName.value.trim(), savedParentId || undefined)
    newDocumentName.value = ''
    createDocumentParentId.value = null
    showCreateDocument.value = false
    // 刷新文档列表以显示新创建的文档
    await fetchDocuments(savedParentId || currentParentId.value)

    // 跳转到新创建的文档编辑页面
    await navigateTo(`${safeLocalePath('/documents')}/${document.id}`)
  } catch (error: unknown) {
    alert(getErrorMessage(error) || documentsData.value?.createDocumentFailed || t('documents.createDocumentFailed'))
  } finally {
    creatingDocument.value = false
  }
}

// 打开创建文档模态框
const openCreateDocumentModal = (parentId?: string | null) => {
  createDocumentParentId.value = parentId || null
  newDocumentName.value = ''
  showCreateDocument.value = true
}

// 使用右键菜单 composable
const {
  getFolderMenuItems,
  getDocumentMenuItems,
  getEmptyAreaMenuItems
} = useDocumentContextMenu({
  onOpen: (item: Document) => {
    if (item.type === 'folder') {
      navigateToFolder(item.id)
    } else {
      navigateTo(`${safeLocalePath('/documents')}/${item.id}`)
    }
  },
  onRename: (item: Document) => {
    openRenameModal(item)
  },
  onDelete: (item: Document, event: Event) => {
    handleDelete(item.id, event)
  },
  onCreateDocument: (parentId?: string | null) => {
    openCreateDocumentModal(parentId)
  },
  onCreateFolder: (parentId?: string | null) => {
    // 如果提供了 parentId，使用它；否则使用当前的 currentParentId
    if (parentId !== undefined && parentId !== null) {
      currentParentId.value = parentId
    }
    showCreateFolder.value = true
  },
  currentParentId: () => currentParentId.value
})
const createNewDocument = () => {
  newDocumentName.value = ''
  showCreateDocument.value = true
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-4">
      <h2 class="text-xl font-semibold">
        {{ documentsData?.documentList || t('documents.documentList') }}
      </h2>
      <div class="flex gap-2">
        <UTooltip
          v-if="(documentsData?.newDocument || t('documents.newDocument')).length > 10"
          :text="documentsData?.newDocument || t('documents.newDocument')"
        >
          <UButton
            icon="i-lucide-file-plus"
            size="sm"
            variant="soft"
            @click="createNewDocument"
          />
        </UTooltip>
        <UButton
          v-else
          icon="i-lucide-file-plus"
          size="sm"
          variant="soft"
          @click="createNewDocument"
        >
          {{ documentsData?.newDocument || t('documents.newDocument') }}
        </UButton>
        <UTooltip
          v-if="(documentsData?.newFolder || t('documents.newFolder')).length > 10"
          :text="documentsData?.newFolder || t('documents.newFolder')"
        >
          <UButton
            icon="i-lucide-folder-plus"
            size="sm"
            @click="showCreateFolder = true"
          />
        </UTooltip>
        <UButton
          v-else
          icon="i-lucide-folder-plus"
          size="sm"
          @click="showCreateFolder = true"
        >
          {{ documentsData?.newFolder || t('documents.newFolder') }}
        </UButton>
      </div>
    </div>

    <UModal
      v-model:open="showCreateFolder"
      :title="documentsData?.newFolder || t('documents.newFolder')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <UFormField
          :label="documentsData?.folderName || t('documents.folderName')"
          name="folderName"
          required
        >
          <UInput
            v-model="newFolderName"
            :placeholder="documentsData?.enterFolderName || t('documents.enterFolderName')"
            @keyup.enter="handleCreateFolder"
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
          :loading="creatingFolder"
          @click="handleCreateFolder"
        >
          {{ documentsData?.create || t('documents.create') }}
        </UButton>
      </template>
    </UModal>

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
        <div
          v-if="createDocumentParentId"
          class="mt-2 text-sm text-muted"
        >
          {{ documentsData?.createInSelectedFolder || t('documents.createInSelectedFolder') }}
        </div>
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

    <UModal
      v-model:open="showRenameModal"
      :title="renamingType === 'folder' ? (documentsData?.renameFolder || t('documents.renameFolder')) : (documentsData?.renameDocument || t('documents.renameDocument'))"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <UFormField
          :label="documentsData?.enterNewName || t('documents.enterNewName')"
          name="newName"
          required
        >
          <UInput
            v-model="renamingName"
            :placeholder="documentsData?.enterNewName || t('documents.enterNewName')"
            @keyup.enter="handleRename"
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
          :loading="renaming"
          @click="handleRename"
        >
          {{ actionsData?.save || t('actions.save') }}
        </UButton>
      </template>
    </UModal>

    <div
      v-if="loading && documents.length === 0"
      class="flex justify-center py-12"
    >
      <UIcon
        name="i-lucide-loader-2"
        class="w-6 h-6 animate-spin"
      />
    </div>

    <UContextMenu
      v-else-if="documents.length === 0"
      :items="getEmptyAreaMenuItems"
    >
      <div class="text-center py-12 text-muted cursor-context-menu">
        {{ documentsData?.noDocuments || t('documents.noDocuments') }}
      </div>
    </UContextMenu>

    <UContextMenu
      v-else
      :items="getEmptyAreaMenuItems"
    >
      <div class="space-y-4">
        <!-- 文件夹列表 -->
        <div
          v-if="folders.length > 0"
          class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          <UContextMenu
            v-for="folder in folders"
            :key="folder.id"
            :items="getFolderMenuItems(folder)"
          >
            <UCard
              class="cursor-pointer hover:shadow-lg transition-shadow border-2 border-dashed"
              @click="navigateToFolder(folder.id)"
            >
              <template #header>
                <div class="flex items-start justify-between">
                  <div class="flex items-center gap-2 flex-1">
                    <UIcon
                      name="i-lucide-folder"
                      class="w-5 h-5 text-warning"
                    />
                    <h3 class="font-semibold text-lg truncate">
                      {{ folder.title }}
                    </h3>
                  </div>
                  <UButton
                    color="error"
                    variant="ghost"
                    icon="i-lucide-trash-2"
                    size="sm"
                    :loading="deletingId === folder.id"
                    @click="handleDelete(folder.id, $event)"
                  />
                </div>
              </template>

              <div class="text-sm text-muted">
                {{ documentsData?.folder || t('documents.folder') }}
              </div>
            </UCard>
          </UContextMenu>
        </div>

        <!-- 文档列表 -->
        <div
          v-if="files.length > 0"
          class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          <UContextMenu
            v-for="doc in files"
            :key="doc.id"
            :items="getDocumentMenuItems(doc)"
          >
            <UCard
              class="cursor-pointer hover:shadow-lg transition-shadow"
              @click="navigateTo(`${safeLocalePath('/documents')}/${doc.id}`)"
            >
              <template #header>
                <div class="flex items-start justify-between">
                  <div class="flex items-center gap-2 flex-1">
                    <UIcon
                      name="i-lucide-file-text"
                      class="w-5 h-5 text-primary"
                    />
                    <h3 class="font-semibold text-lg truncate">
                      {{ doc.title || (documentsData?.untitledDocument || t('documents.untitledDocument')) }}
                    </h3>
                  </div>
                  <UButton
                    color="error"
                    variant="ghost"
                    icon="i-lucide-trash-2"
                    size="sm"
                    :loading="deletingId === doc.id"
                    @click="handleDelete(doc.id, $event)"
                  />
                </div>
              </template>

              <div class="text-sm text-muted space-y-1">
                <div>
                  {{ documentsData?.createdAt || t('documents.createdAt') }}：{{ formatDate(doc.created_at) }}
                </div>
                <div>
                  {{ documentsData?.updatedAt || t('documents.updatedAt') }}：{{ formatDate(doc.updated_at) }}
                </div>
              </div>
            </UCard>
          </UContextMenu>
        </div>
      </div>
    </UContextMenu>
  </div>
</template>
