<script lang="ts" setup>
import { useDocuments } from '~/composables/useDocuments'
import { useSafeLocalePath } from '~/utils/safeLocalePath'
import type { Document } from '~/types'

interface DocumentTreeNode extends Document {
  children?: DocumentTreeNode[]
}

const { fetchDocumentTree, deleteDocument, createFolder, getDocument, renameDocument } = useDocuments()
const { downloadAsZip, isDownloading } = useDownloadZip()
const router = useRouter()
const safeLocalePath = useSafeLocalePath()

const actionsData = computed(() => $tm('actions') as Record<string, string> | undefined)
const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)

const tree = ref<DocumentTreeNode[]>([])
const flat = ref<Document[]>([])
const loading = ref(false)
const expandedFolders = ref<Set<string>>(new Set())
const deletingId = ref<string | null>(null)
const downloadingId = ref<string | null>(null)
const renamingId = ref<string | null>(null)
const showCreateFolder = ref(false)
const newFolderName = ref('')
const creatingFolder = ref(false)
const selectedParentId = ref<string | null>(null)
const { renameDocument } = useDocuments()

// 加载文档树
const loadTree = async () => {
  try {
    loading.value = true
    const data = await fetchDocumentTree()
    tree.value = data.tree as DocumentTreeNode[]
    flat.value = data.flat
    // 默认展开所有文件夹
    expandAll()
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

// 折叠所有文件夹
const collapseAll = () => {
  expandedFolders.value.clear()
}

// 处理删除
const handleDelete = async (id: string, event: Event) => {
  event.stopPropagation()
  const item = flat.value.find(d => d.id === id)
  const itemType = item?.type === 'folder' ? (documentsData.value?.folder || '文件夹') : (documentsData.value?.document || '文档')
  const deleteConfirm = documentsData.value?.deleteConfirm?.replace('{type}', itemType) || `确定要删除这个${itemType}吗？`
  const deleteWarning = item?.type === 'folder' ? (documentsData.value?.deleteFolderWarning || '文件夹内的所有内容也会被删除。') : ''

  if (!confirm(`${deleteConfirm}${deleteWarning}`)) {
    return
  }

  try {
    deletingId.value = id
    await deleteDocument(id)
    // 重新加载树
    await loadTree()
  } catch (error: any) {
    alert(error.message || documentsData.value?.deleteFailed || '删除失败')
  } finally {
    deletingId.value = null
  }
}

// 处理创建文件夹
const handleCreateFolder = async () => {
  if (!newFolderName.value.trim()) {
    alert(documentsData.value?.enterFolderName || '请输入文件夹名称')
    return
  }

  try {
    creatingFolder.value = true
    await createFolder(newFolderName.value.trim(), selectedParentId.value || undefined)
    newFolderName.value = ''
    selectedParentId.value = null
    showCreateFolder.value = false
    // 重新加载树
    await loadTree()
  } catch (error: any) {
    alert(error.message || documentsData.value?.createFolderFailed || '创建文件夹失败')
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
      alert(actionsData.value?.documentEmpty || '文档内容为空')
      return
    }

    // 生成文件名（使用文档标题，如果没有则使用 ID）
    const filename = document.title 
      ? `${document.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '-')}.zip`
      : `document-${id}.zip`

    // 下载为 ZIP
    await downloadAsZip(document.content, filename)
  } catch (error: any) {
    console.error('Download failed:', error)
    alert(error.message || actionsData.value?.downloadFailed || '下载失败，请稍后重试')
  } finally {
    downloadingId.value = null
  }
}

// 处理节点点击
const handleNodeClick = (node: DocumentTreeNode) => {
  if (node.type === 'folder') {
    toggleFolder(node.id)
  } else {
    router.push(`${safeLocalePath('/documents')}/${node.id}`)
  }
}

// 处理在文件夹内创建子文件夹
const handleCreateSubFolder = (folderId: string, event: Event) => {
  event.stopPropagation()
  selectedParentId.value = folderId
  showCreateFolder.value = true
}

// 处理开始重命名
const handleStartRename = (id: string) => {
  renamingId.value = id
}

// 处理取消重命名
const handleCancelRename = () => {
  renamingId.value = null
}

// 处理重命名
const handleRename = async (id: string, newTitle: string) => {
  try {
    await renameDocument(id, newTitle)
    // 重新加载树
    await loadTree()
    renamingId.value = null
  } catch (error: any) {
    console.error('重命名失败:', error)
    alert(error.message || documentsData.value?.renameFailed || '重命名失败，请稍后重试')
  }
}

onMounted(() => {
  loadTree()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-4">
      <h2 class="text-xl font-semibold">
        {{ documentsData?.documentTree || '文档树' }}
      </h2>
      <div class="flex gap-2">
        <UButton
          :to="safeLocalePath('/')"
          icon="i-lucide-file-plus"
          size="sm"
          variant="soft"
        >
          {{ documentsData?.newDocument || '新建文档' }}
        </UButton>
        <UButton
          icon="i-lucide-folder-plus"
          size="sm"
          @click="() => { selectedParentId = null; showCreateFolder = true }"
        >
          {{ documentsData?.newFolder || '新建文件夹' }}
        </UButton>
        <UButton
          icon="i-lucide-chevrons-down-up"
          size="sm"
          variant="ghost"
          @click="expandAll"
        >
          {{ documentsData?.expandAll || '展开全部' }}
        </UButton>
        <UButton
          icon="i-lucide-chevrons-up-down"
          size="sm"
          variant="ghost"
          @click="collapseAll"
        >
          {{ documentsData?.collapseAll || '折叠全部' }}
        </UButton>
      </div>
    </div>

    <!-- 创建文件夹模态框 -->
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
        <div
          v-if="selectedParentId"
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
          :loading="creatingFolder"
          @click="handleCreateFolder"
        >
          {{ documentsData?.create || '创建' }}
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
    <div
      v-else-if="tree.length === 0"
      class="text-center py-12 text-gray-500"
    >
      {{ documentsData?.noDocuments || '还没有文档，开始创建你的第一个文档吧！' }}
    </div>

    <!-- 树形视图 -->
    <div
      v-else
      class="border border-gray-200 dark:border-gray-700 rounded-lg p-2 bg-white dark:bg-gray-900"
    >
      <DocumentsDocumentTreeNode
        v-for="node in tree"
        :key="node.id"
        :node="node"
        :level="0"
        :expanded-folders="expandedFolders"
        :deleting-id="deletingId"
        :downloading-id="downloadingId"
        :renaming-id="renamingId"
        @toggle="(id: string) => toggleFolder(id)"
        @click="(n: DocumentTreeNode) => handleNodeClick(n)"
        @delete="(id: string, e: Event) => handleDelete(id, e)"
        @create-sub-folder="(id: string, e: Event) => handleCreateSubFolder(id, e)"
        @download="(id: string, e: Event) => handleDownload(id, e)"
        @rename="(id: string, title: string) => handleRename(id, title)"
        @start-rename="(id: string) => handleStartRename(id)"
        @cancel-rename="() => handleCancelRename()"
      />
    </div>
  </div>
</template>
