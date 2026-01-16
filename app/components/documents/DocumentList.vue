<script lang="ts" setup>
import { useDocuments } from '~/composables/useDocuments'
import { useDocumentContextMenu } from '~/composables/useDocumentContextMenu'
import { useSafeLocalePath } from '~/utils/safeLocalePath'
import type { Document } from '~/types'

interface Props {
  parentId?: string
}

const props = defineProps<Props>()

const { documents, loading, fetchDocuments, deleteDocument, createFolder, createEmptyDocument, renameDocument } = useDocuments()
const router = useRouter()
const safeLocalePath = useSafeLocalePath()

const documentsData = computed(() => $tm('documents') as Record<string, any> | undefined)
const actionsData = computed(() => $tm('actions') as Record<string, string> | undefined)

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
  const itemType = item?.type === 'folder' ? (documentsData.value?.folder || '文件夹') : (documentsData.value?.document || '文档')
  const deleteConfirm = documentsData.value?.deleteConfirm?.replace('{type}', itemType) || `确定要删除这个${itemType}吗？`
  const deleteWarning = item?.type === 'folder' ? (documentsData.value?.deleteFolderWarning || '文件夹内的所有内容也会被删除。') : ''

  if (!confirm(`${deleteConfirm}${deleteWarning}`)) {
    return
  }

  try {
    deletingId.value = id
    await deleteDocument(id)
  } catch (error: any) {
    alert(error.message || documentsData.value?.deleteFailed || '删除失败')
  } finally {
    deletingId.value = null
  }
}

const handleCreateFolder = async () => {
  if (!newFolderName.value.trim()) {
    alert(documentsData.value?.enterFolderName || '请输入文件夹名称')
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
  } catch (error: any) {
    alert(error.message || documentsData.value?.createFolderFailed || '创建文件夹失败')
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
    alert(documentsData.value?.enterNewName || '请输入新名称')
    return
  }

  try {
    renaming.value = true
    await renameDocument(renamingId.value, renamingName.value.trim())
    renamingId.value = null
    renamingName.value = ''
    showRenameModal.value = false
  } catch (error: any) {
    alert(error.message || documentsData.value?.renameFailed || '重命名失败')
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
    alert(documentsData.value?.enterDocumentName || '请输入文档名称')
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
  } catch (error: any) {
    alert(error.message || documentsData.value?.createDocumentFailed || '创建文档失败')
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
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-4">
      <h2 class="text-xl font-semibold">
        {{ documentsData?.documentList || '文档列表' }}
      </h2>
      <div class="flex gap-2">
        <UTooltip
          v-if="(documentsData?.newDocument || '新建文档').length > 10"
          :text="documentsData?.newDocument || '新建文档'"
        >
          <UButton
            :to="currentParentId ? `${safeLocalePath('/')}?folder=${currentParentId}` : safeLocalePath('/')"
            icon="i-lucide-file-plus"
            size="sm"
            variant="soft"
          />
        </UTooltip>
        <UButton
          v-else
          :to="currentParentId ? `${safeLocalePath('/')}?folder=${currentParentId}` : safeLocalePath('/')"
          icon="i-lucide-file-plus"
          size="sm"
          variant="soft"
        >
          {{ documentsData?.newDocument || '新建文档' }}
        </UButton>
        <UTooltip
          v-if="(documentsData?.newFolder || '新建文件夹').length > 10"
          :text="documentsData?.newFolder || '新建文件夹'"
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
          {{ documentsData?.newFolder || '新建文件夹' }}
        </UButton>
      </div>
    </div>

    <UModal
      v-model:open="showCreateFolder"
      :title="documentsData?.newFolder || '新建文件夹'"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <UFormField
          :label="documentsData?.folderName || '文件夹名称'"
          name="folderName"
          required
        >
          <UInput
            v-model="newFolderName"
            :placeholder="documentsData?.enterFolderName || '请输入文件夹名称'"
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
          {{ actionsData?.cancel || '取消' }}
        </UButton>
        <UButton
          :loading="creatingFolder"
          @click="handleCreateFolder"
        >
          {{ documentsData?.create || '创建' }}
        </UButton>
      </template>
    </UModal>

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
        <div
          v-if="createDocumentParentId"
          class="mt-2 text-sm text-gray-500"
        >
          {{ documentsData?.createInSelectedFolder || '将在选中的文件夹内创建' }}
        </div>
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

    <UModal
      v-model:open="showRenameModal"
      :title="renamingType === 'folder' ? (documentsData?.renameFolder || '重命名文件夹') : (documentsData?.renameDocument || '重命名文档')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <UFormField
          :label="documentsData?.enterNewName || '请输入新名称'"
          name="newName"
          required
        >
          <UInput
            v-model="renamingName"
            :placeholder="documentsData?.enterNewName || '请输入新名称'"
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
          {{ actionsData?.cancel || '取消' }}
        </UButton>
        <UButton
          :loading="renaming"
          @click="handleRename"
        >
          {{ actionsData?.save || '保存' }}
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
      <div class="text-center py-12 text-gray-500 cursor-context-menu">
        {{ documentsData?.noDocuments || '还没有文档，开始创建你的第一个文档吧！' }}
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
                      class="w-5 h-5 text-yellow-500"
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

              <div class="text-sm text-gray-500">
                {{ documentsData?.folder || '文件夹' }}
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
                      class="w-5 h-5 text-blue-500"
                    />
                    <h3 class="font-semibold text-lg truncate">
                      {{ doc.title || (documentsData?.untitledDocument || '未命名文档') }}
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

              <div class="text-sm text-gray-500 space-y-1">
                <div>
                  {{ documentsData?.createdAt || '创建时间' }}：{{ formatDate(doc.created_at) }}
                </div>
                <div>
                  {{ documentsData?.updatedAt || '更新时间' }}：{{ formatDate(doc.updated_at) }}
                </div>
              </div>
            </UCard>
          </UContextMenu>
        </div>
      </div>
    </UContextMenu>
  </div>
</template>
