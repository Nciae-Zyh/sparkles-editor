<script lang="ts" setup>
import { useDocuments } from '~/composables/useDocuments'
import { useDocumentContextMenu } from '~/composables/useDocumentContextMenu'
import { useSafeLocalePath } from '~/utils/safeLocalePath'
import type { Document } from '~/types'

const { tm: $tm, t } = useI18n()

interface DocumentTreeNode extends Document {
  children?: DocumentTreeNode[]
}

const { fetchDocumentTree, deleteDocument, createFolder, createEmptyDocument, getDocument, renameDocument } = useDocuments()
const { downloadAsZip } = useDownloadZip()
const route = useRoute()
const safeLocalePath = useSafeLocalePath()

// 获取当前路由的文档ID，用于高亮显示
const currentDocumentId = computed(() => {
  const id = route.params.id
  return id && typeof id === 'string' ? id : null
})

const actionsData = computed(() => $tm('actions') as Record<string, string> | undefined)
const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)

const tree = ref<DocumentTreeNode[]>([])
const flat = ref<Document[]>([])
const loading = ref(false)
const expandedFolders = ref<Set<string>>(new Set())
const deletingId = ref<string | null>(null)
const downloadingId = ref<string | null>(null)
const renamingId = ref<string | null>(null)
const renamingLoadingId = ref<string | null>(null)
const showRenameModal = ref(false)
const renameInput = ref('')
const showCreateFolder = ref(false)
const newFolderName = ref('')
const creatingFolder = ref(false)
const selectedParentId = ref<string | null>(null)

// 创建文档相关状态
const showCreateDocument = ref(false)
const newDocumentName = ref('')
const creatingDocument = ref(false)
const createDocumentParentId = ref<string | null>(null)

const getErrorMessage = (error: unknown) => {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') {
      return message
    }
  }
  return ''
}

// 加载文档树
const loadTree = async () => {
  try {
    loading.value = true
    const data = await fetchDocumentTree()
    tree.value = data.tree as DocumentTreeNode[]
    flat.value = data.flat

    // 如果有当前文档ID，展开到该文档；否则展开所有文件夹
    if (currentDocumentId.value) {
      expandToDocument(currentDocumentId.value)
    } else {
      expandAll()
    }
  } catch (error) {
    console.error('Failed to load document tree:', error)
  } finally {
    loading.value = false
  }
}

// 展开/折叠文件夹
const toggleFolder = (folderId: string) => {
  if (expandedFolders.value.has(folderId)) {
    expandedFolders.value.delete(folderId)
  } else {
    expandedFolders.value.add(folderId)
  }
}

// 展开所有文件夹
const expandAll = () => {
  const expand = (nodes: DocumentTreeNode[]) => {
    for (const node of nodes) {
      if (node.type === 'folder') {
        expandedFolders.value.add(node.id)
        if (node.children) {
          expand(node.children)
        }
      }
    }
  }
  expand(tree.value)
}

// 展开到指定文档的路径
const expandToDocument = (documentId: string) => {
  // 在 flat 数组中找到文档
  const document = flat.value.find(d => d.id === documentId)
  if (!document) return

  // 递归获取所有父文件夹ID
  const parentIds: string[] = []
  let currentParentId: string | null = document.parent_id || null

  while (currentParentId) {
    parentIds.push(currentParentId)
    const parentDoc = flat.value.find(d => d.id === currentParentId)
    if (!parentDoc) break
    currentParentId = parentDoc.parent_id || null
  }

  // 展开所有父文件夹
  for (const folderId of parentIds) {
    expandedFolders.value.add(folderId)
  }
}

// 折叠所有文件夹
const collapseAll = () => {
  expandedFolders.value.clear()
}

// 处理删除
const handleDelete = async (id: string, event: Event) => {
  event.stopPropagation()
  const item = flat.value.find(d => d.id === id)
  const itemType = item?.type === 'folder' ? (documentsData.value?.folder || t('documents.folder')) : (documentsData.value?.document || t('documents.document'))
  const deleteConfirm = documentsData.value?.deleteConfirm?.replace('{type}', itemType) || t('documents.deleteConfirm', { type: itemType })
  const deleteWarning = item?.type === 'folder' ? (documentsData.value?.deleteFolderWarning || t('documents.deleteFolderWarning')) : ''

  if (!confirm(`${deleteConfirm}${deleteWarning}`)) {
    return
  }

  try {
    deletingId.value = id
    await deleteDocument(id)
    // 重新加载树
    await loadTree()
  } catch (error: unknown) {
    alert(getErrorMessage(error) || documentsData.value?.deleteFailed || t('documents.deleteFailed'))
  } finally {
    deletingId.value = null
  }
}

// 处理创建文件夹
const handleCreateFolder = async () => {
  if (!newFolderName.value.trim()) {
    alert(documentsData.value?.enterFolderName || t('documents.enterFolderName'))
    return
  }

  try {
    creatingFolder.value = true
    const savedParentId = selectedParentId.value // 保存 parentId
    await createFolder(newFolderName.value.trim(), savedParentId || undefined)
    newFolderName.value = ''
    selectedParentId.value = null
    showCreateFolder.value = false
    // 重新加载树
    await loadTree()
  } catch (error: unknown) {
    alert(getErrorMessage(error) || documentsData.value?.createFolderFailed || t('documents.createFolderFailed'))
  } finally {
    creatingFolder.value = false
  }
}

// 处理下载文档
const handleDownload = async (id: string, event: Event) => {
  event.stopPropagation()

  try {
    downloadingId.value = id
    // 获取文档内容
    const document = await getDocument(id)
    if (!document.content) {
      alert(actionsData.value?.documentEmpty || t('actions.documentEmpty'))
      return
    }

    // 生成文件名（使用文档标题，如果没有则使用 ID）
    const filename = document.title
      ? `${document.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '-')}.zip`
      : `document-${id}.zip`

    // 下载为 ZIP
    await downloadAsZip(document.content, filename)
  } catch (error: unknown) {
    console.error('Download failed:', error)
    alert(getErrorMessage(error) || actionsData.value?.downloadFailed || t('actions.downloadFailed'))
  } finally {
    downloadingId.value = null
  }
}

// 处理节点点击
const handleNodeClick = async (node: DocumentTreeNode) => {
  if (node.type === 'folder') {
    toggleFolder(node.id)
  } else {
    await navigateTo(`${safeLocalePath('/documents')}/${node.id}`)
  }
}

// 处理在文件夹内创建子文件夹
const handleCreateSubFolder = (folderId: string, event: Event) => {
  event.stopPropagation()
  selectedParentId.value = folderId
  showCreateFolder.value = true
}

// 处理在文件夹内创建文档（空文档）
const handleCreateDocument = async (parentId?: string | null) => {
  if (!newDocumentName.value.trim()) {
    alert(documentsData.value?.enterDocumentName || t('documents.enterDocumentName'))
    return
  }

  try {
    creatingDocument.value = true
    const targetParentId = parentId === undefined ? createDocumentParentId.value : parentId
    const document = await createEmptyDocument(newDocumentName.value.trim(), targetParentId || undefined)
    newDocumentName.value = ''
    createDocumentParentId.value = null
    showCreateDocument.value = false
    // 重新加载树
    await loadTree()

    // 跳转到新创建的文档编辑页面
    await navigateTo(`${safeLocalePath('/documents')}/${document.id}`)
  } catch (error: unknown) {
    alert(getErrorMessage(error) || documentsData.value?.createDocumentFailed || t('documents.createDocumentFailed'))
  } finally {
    creatingDocument.value = false
  }
}

// 处理开始重命名
const handleStartRename = (id: string) => {
  const node = flat.value.find(d => d.id === id)
  renamingId.value = id
  renameInput.value = node?.title || ''
  showRenameModal.value = true
}

// 处理取消重命名
const handleCancelRename = () => {
  renamingId.value = null
  renameInput.value = ''
  showRenameModal.value = false
}

// 处理重命名
const handleRename = async () => {
  if (!renamingId.value || !renameInput.value.trim()) {
    alert(documentsData.value?.pleaseEnterTitle || t('documents.pleaseEnterTitle'))
    return
  }

  const id = renamingId.value
  const newTitle = renameInput.value.trim()

  // 验证标题不能包含路径分隔符
  if (newTitle.includes('/') || newTitle.includes('\\')) {
    alert(documentsData.value?.titleCannotContainPath || t('documents.titleCannotContainPath'))
    return
  }

  try {
    renamingLoadingId.value = id
    await renameDocument(id, newTitle)
    // 重新加载树
    await loadTree()
    handleCancelRename()

    // 发布重命名通知，通知编辑页面更新
    const nuxtApp = useNuxtApp()
    if (nuxtApp.$publishNotification) {
      nuxtApp.$publishNotification('document:renamed', {
        id,
        title: newTitle
      })
    }
  } catch (error: unknown) {
    console.error('重命名失败:', error)
    alert(getErrorMessage(error) || documentsData.value?.renameFailedRetry || documentsData.value?.renameFailed || t('documents.renameFailed'))
  } finally {
    renamingLoadingId.value = null
  }
}

// 使用右键菜单 composable（用于空白区域）
const { getEmptyAreaMenuItems } = useDocumentContextMenu({
  onCreateDocument: () => {
    handleCreateDocument(null)
  },
  onCreateFolder: (parentId?: string | null) => {
    selectedParentId.value = parentId || null
    showCreateFolder.value = true
  },
  currentParentId: () => null
})

onMounted(() => {
  loadTree()

  // 订阅编辑页面的重命名通知
  const nuxtApp = useNuxtApp()
  if (nuxtApp.$subscribeNotification) {
    const unsubscribe = nuxtApp.$subscribeNotification<{ id: string, title: string }>('document:renamed', (payload) => {
      // 如果重命名的是树中的某个文档，更新树中的标题
      if (payload && payload.id) {
        const updateNodeTitle = (nodes: DocumentTreeNode[]): boolean => {
          for (const node of nodes) {
            if (node.id === payload.id) {
              node.title = payload.title
              return true
            }
            if (node.children && updateNodeTitle(node.children)) {
              return true
            }
          }
          return false
        }
        updateNodeTitle(tree.value)
      }
    })

    // 组件卸载时取消订阅
    onUnmounted(() => {
      unsubscribe()
    })
  }
})

// 监听路由变化，当切换到新文档时展开到该文档
watch(currentDocumentId, async (newId) => {
  if (newId && flat.value.length > 0) {
    expandToDocument(newId)
  }
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-4">
      <h2 class="text-xl font-semibold">
        {{ documentsData?.documentTree || t('documents.documentTree') }}
      </h2>
      <div class="flex gap-2">
        <UButton
          :to="safeLocalePath('/')"
          icon="i-lucide-file-plus"
          size="sm"
          variant="soft"
        >
          {{ documentsData?.newDocument || t('documents.newDocument') }}
        </UButton>
        <UButton
          icon="i-lucide-folder-plus"
          size="sm"
          @click="() => { selectedParentId = null; showCreateFolder = true }"
        >
          {{ documentsData?.newFolder || t('documents.newFolder') }}
        </UButton>
        <UButton
          icon="i-lucide-chevrons-down-up"
          size="sm"
          variant="ghost"
          @click="expandAll"
        >
          {{ documentsData?.expandAll || t('documents.expandAll') }}
        </UButton>
        <UButton
          icon="i-lucide-chevrons-up-down"
          size="sm"
          variant="ghost"
          @click="collapseAll"
        >
          {{ documentsData?.collapseAll || t('documents.collapseAll') }}
        </UButton>
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

    <!-- 创建文件夹模态框 -->
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
        <div
          v-if="selectedParentId"
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
          :loading="creatingFolder"
          @click="handleCreateFolder"
        >
          {{ documentsData?.create || t('documents.create') }}
        </UButton>
      </template>
    </UModal>

    <!-- 重命名模态框 -->
    <UModal
      v-model:open="showRenameModal"
      :title="documentsData?.rename || t('documents.rename')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <UFormField
          :label="documentsData?.name || t('documents.name')"
          name="renameInput"
          required
        >
          <UInput
            v-model="renameInput"
            :placeholder="documentsData?.pleaseEnterTitle || t('documents.pleaseEnterTitle')"
            autofocus
            @keyup.enter="handleRename"
          />
        </UFormField>
      </template>

      <template #footer>
        <UButton
          color="neutral"
          variant="ghost"
          @click="handleCancelRename"
        >
          {{ actionsData?.cancel || t('actions.cancel') }}
        </UButton>
        <UButton
          :loading="renamingLoadingId !== null"
          @click="handleRename"
        >
          {{ documentsData?.save || t('documents.save') }}
        </UButton>
      </template>
    </UModal>

    <!-- 加载状态 -->
    <div
      v-if="loading && tree.length === 0"
      class="flex justify-center py-12"
    >
      <UIcon
        name="i-lucide-loader-2"
        class="w-6 h-6 animate-spin"
      />
    </div>

    <!-- 空状态 -->
    <UContextMenu
      v-else-if="tree.length === 0"
      :items="getEmptyAreaMenuItems"
    >
      <div class="text-center py-12 text-muted cursor-context-menu">
        {{ documentsData?.noDocuments || t('documents.noDocuments') }}
      </div>
    </UContextMenu>

    <!-- 树形视图 -->
    <UContextMenu
      v-else
      :items="getEmptyAreaMenuItems"
    >
      <div class="border border-default rounded-lg p-2 bg-default">
        <DocumentsDocumentTreeNode
          v-for="node in tree"
          :key="node.id"
          :node="node"
          :level="0"
          :expanded-folders="expandedFolders"
          :deleting-id="deletingId"
          :downloading-id="downloadingId"
          :renaming-id="renamingId"
          :renaming-loading-id="renamingLoadingId"
          :current-document-id="currentDocumentId"
          @toggle="(id: string) => toggleFolder(id)"
          @click="(n: DocumentTreeNode) => handleNodeClick(n)"
          @delete="(id: string, e: Event) => handleDelete(id, e)"
          @create-sub-folder="(id: string, e: Event) => handleCreateSubFolder(id, e)"
          @create-document="(folderId: string | null) => handleCreateDocument(folderId)"
          @download="(id: string, e: Event) => handleDownload(id, e)"
          @start-rename="(id: string) => handleStartRename(id)"
        />
      </div>
    </UContextMenu>
  </div>
</template>
