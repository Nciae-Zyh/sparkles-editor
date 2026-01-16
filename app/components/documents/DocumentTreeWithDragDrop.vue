<script lang="ts" setup>
import type { TreeItem } from '@nuxt/ui'
import type { Document } from '~/types'
import { useDocuments } from '~/composables/useDocuments'
import { useSafeLocalePath } from '~/utils/safeLocalePath'

interface DocumentTreeNode extends Document {
  children?: DocumentTreeNode[]
}

interface ExtendedTreeItem extends TreeItem {
  id: string
  type: 'document' | 'folder'
  children?: ExtendedTreeItem[]
}

const { fetchDocumentTree, deleteDocument, createFolder, renameDocument, moveDocument } = useDocuments()
const router = useRouter()
const safeLocalePath = useSafeLocalePath()

const actionsData = computed(() => $tm('actions') as Record<string, string> | undefined)
const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)

const treeItems = ref<ExtendedTreeItem[]>([])
const flatDocuments = ref<Document[]>([])
const loading = ref(false)
const expanded = ref<string[]>([])
const deletingId = ref<string | null>(null)
const renamingId = ref<string | null>(null)
const renamingLoadingId = ref<string | null>(null)
const renameInput = ref('')
const showCreateFolder = ref(false)
const newFolderName = ref('')
const creatingFolder = ref(false)
const selectedParentId = ref<string | null>(null)

// 拖放相关状态
const draggedItemId = ref<string | null>(null)
const dragOverItemId = ref<string | null>(null)
const dragOverPosition = ref<'before' | 'after' | 'inside' | null>(null)

// 将 Document 树转换为 TreeItem 格式
const convertToTreeItems = (nodes: DocumentTreeNode[]): ExtendedTreeItem[] => {
  return nodes.map(node => {
    const item: ExtendedTreeItem = {
      id: node.id,
      label: node.title || (documentsData.value?.untitled || '未命名'),
      type: node.type,
      icon: node.type === 'folder' ? 'i-lucide-folder' : 'i-lucide-file-text',
      children: node.children && node.children.length > 0 ? convertToTreeItems(node.children) : undefined,
      onSelect: (e: Event) => {
        // 阻止默认选择行为，我们通过点击标签来处理
        e.preventDefault()
      }
    }
    return item
  })
}

// 加载文档树
const loadTree = async () => {
  try {
    loading.value = true
    const data = await fetchDocumentTree()
    flatDocuments.value = data.flat
    const tree = data.tree as DocumentTreeNode[]
    
    // 默认展开所有文件夹
    const allFolderIds: string[] = []
    const collectFolderIds = (nodes: DocumentTreeNode[]) => {
      for (const node of nodes) {
        if (node.type === 'folder') {
          allFolderIds.push(node.id)
          if (node.children) {
            collectFolderIds(node.children)
          }
        }
      }
    }
    collectFolderIds(tree)
    expanded.value = allFolderIds
    
    treeItems.value = convertToTreeItems(tree)
  } catch (error) {
    console.error('Failed to load document tree:', error)
  } finally {
    loading.value = false
  }
}

// 展开/折叠所有
const expandAll = () => {
  const allFolderIds: string[] = []
  const collectFolderIds = (items: ExtendedTreeItem[]) => {
    for (const item of items) {
      if (item.type === 'folder') {
        allFolderIds.push(item.id)
        if (item.children) {
          collectFolderIds(item.children)
        }
      }
    }
  }
  collectFolderIds(treeItems.value)
  expanded.value = allFolderIds
}

const collapseAll = () => {
  expanded.value = []
}

// 处理节点点击
const handleNodeClick = (item: ExtendedTreeItem) => {
  if (renamingId.value === item.id) return
  
  if (item.type === 'folder') {
    // 切换展开/折叠
    const index = expanded.value.indexOf(item.id)
    if (index > -1) {
      expanded.value.splice(index, 1)
    } else {
      expanded.value.push(item.id)
    }
  } else {
    // 打开文档
    navigateTo(`${safeLocalePath('/documents')}/${item.id}`)
  }
}

// 处理删除
const handleDelete = async (id: string, event: Event) => {
  event.stopPropagation()
  const item = flatDocuments.value.find(d => d.id === id)
  const itemType = item?.type === 'folder' ? (documentsData.value?.folder || '文件夹') : (documentsData.value?.document || '文档')
  const deleteConfirm = documentsData.value?.deleteConfirm?.replace('{type}', itemType) || `确定要删除这个${itemType}吗？`
  const deleteWarning = item?.type === 'folder' ? (documentsData.value?.deleteFolderWarning || '文件夹内的所有内容也会被删除。') : ''

  if (!confirm(`${deleteConfirm}${deleteWarning}`)) {
    return
  }

  try {
    deletingId.value = id
    await deleteDocument(id)
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
    await loadTree()
  } catch (error: any) {
    alert(error.message || documentsData.value?.createFolderFailed || '创建文件夹失败')
  } finally {
    creatingFolder.value = false
  }
}

// 处理开始重命名
const handleStartRename = (id: string, currentTitle: string) => {
  renamingId.value = id
  renameInput.value = currentTitle
}

// 处理取消重命名
const handleCancelRename = () => {
  renamingId.value = null
  renameInput.value = ''
}

// 处理重命名
const handleRename = async (id: string) => {
  if (!renameInput.value.trim()) {
    alert(documentsData.value?.pleaseEnterTitle || '请输入名称')
    return
  }

  try {
    renamingLoadingId.value = id
    await renameDocument(id, renameInput.value.trim())
    await loadTree()
    renamingId.value = null
    renameInput.value = ''
  } catch (error: any) {
    console.error('重命名失败:', error)
    alert(error.message || documentsData.value?.renameFailed || '重命名失败，请稍后重试')
  } finally {
    renamingLoadingId.value = null
  }
}

// 查找树中的项目
const findItemInTree = (items: ExtendedTreeItem[], id: string): ExtendedTreeItem | null => {
  for (const item of items) {
    if (item.id === id) {
      return item
    }
    if (item.children) {
      const found = findItemInTree(item.children, id)
      if (found) return found
    }
  }
  return null
}

// 检查是否是子项（防止循环引用）
const isDescendant = (parentId: string, childId: string): boolean => {
  // 如果 parentId 和 childId 相同，直接返回 true（不能移动到自己）
  if (parentId === childId) return true
  
  const parent = findItemInTree(treeItems.value, parentId)
  if (!parent || !parent.children) return false
  
  const checkChildren = (items: ExtendedTreeItem[], visited: Set<string> = new Set()): boolean => {
    // 防止无限递归
    if (visited.has(parentId)) return false
    visited.add(parentId)
    
    for (const item of items) {
      if (item.id === childId) return true
      if (item.children) {
        // 递归检查子项
        if (checkChildren(item.children, visited)) return true
      }
    }
    return false
  }
  
  return checkChildren(parent.children)
}

// 拖放处理
const handleDragStart = (event: DragEvent, item: ExtendedTreeItem) => {
  draggedItemId.value = item.id
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', item.id)
  }
}

const handleDragOver = (event: DragEvent, item: ExtendedTreeItem) => {
  event.preventDefault()
  event.stopPropagation()
  
  if (!draggedItemId.value || draggedItemId.value === item.id) {
    dragOverItemId.value = null
    dragOverPosition.value = null
    return
  }

  // 防止将文件夹移动到自己的子文件夹中
  if (draggedItemId.value && item.type === 'folder' && isDescendant(draggedItemId.value, item.id)) {
    dragOverItemId.value = null
    dragOverPosition.value = null
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'none'
    }
    return
  }

  dragOverItemId.value = item.id
  
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const y = event.clientY - rect.top
  const height = rect.height
  
  // 如果目标是文件夹，允许放入内部
  if (item.type === 'folder') {
    if (y < height * 0.25) {
      dragOverPosition.value = 'before'
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move'
      }
    } else if (y > height * 0.75) {
      dragOverPosition.value = 'after'
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move'
      }
    } else {
      dragOverPosition.value = 'inside'
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move'
      }
    }
  } else {
    // 如果是文件，只能放在前面或后面
    dragOverPosition.value = y < height / 2 ? 'before' : 'after'
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
  }
}

const handleDragLeave = () => {
  dragOverItemId.value = null
  dragOverPosition.value = null
}

const handleDrop = async (event: DragEvent, targetItem: ExtendedTreeItem) => {
  event.preventDefault()
  event.stopPropagation()
  
  if (!draggedItemId.value || !targetItem || draggedItemId.value === targetItem.id) {
    dragOverItemId.value = null
    dragOverPosition.value = null
    draggedItemId.value = null
    return
  }

  // 防止将文件夹移动到自己的子文件夹中（更严格的检查）
  if (draggedItemId.value) {
    // 检查1：不能移动到自己
    if (draggedItemId.value === targetItem.id) {
      alert('不能将项目移动到自己的位置')
      dragOverItemId.value = null
      dragOverPosition.value = null
      draggedItemId.value = null
      return
    }

    // 检查2：如果目标是文件夹，检查是否是自己的子文件夹
    if (targetItem.type === 'folder' && isDescendant(draggedItemId.value, targetItem.id)) {
      alert('不能将文件夹移动到自己的子文件夹中')
      dragOverItemId.value = null
      dragOverPosition.value = null
      draggedItemId.value = null
      return
    }
  }

  try {
    let newParentId: string | null = null
    
    if (dragOverPosition.value === 'inside' && targetItem.type === 'folder') {
      // 放入文件夹内部
      newParentId = targetItem.id
    } else {
      // 放在前面或后面，需要找到目标项的父文件夹
      const findParent = (items: ExtendedTreeItem[], targetId: string, parent: ExtendedTreeItem | null = null): ExtendedTreeItem | null => {
        for (const item of items) {
          if (item.id === targetId) {
            return parent
          }
          if (item.children) {
            const found = findParent(item.children, targetId, item)
            if (found !== null) return found
          }
        }
        return null
      }
      
      const parent = findParent(treeItems.value, targetItem.id)
      newParentId = parent?.id || null
    }

    // 如果移动的是文件夹，且目标也是文件夹，且拖放位置不是明确的 inside，则放入文件夹内部
    const draggedItem = findItemInTree(treeItems.value, draggedItemId.value)
    if (draggedItem?.type === 'folder' && targetItem.type === 'folder' && dragOverPosition.value !== 'before' && dragOverPosition.value !== 'after') {
      newParentId = targetItem.id
    }

    await moveDocument(draggedItemId.value, newParentId)
    await loadTree()
  } catch (error: any) {
    console.error('移动失败:', error)
    alert(error.message || '移动失败，请稍后重试')
  } finally {
    dragOverItemId.value = null
    dragOverPosition.value = null
    draggedItemId.value = null
  }
}

const handleDragEnd = () => {
  dragOverItemId.value = null
  dragOverPosition.value = null
  draggedItemId.value = null
}

// 修复路径
const fixingPaths = ref(false)
const handleFixPaths = async () => {
  if (!confirm('确定要修复所有文档路径吗？这将重新计算所有文档和文件夹的路径，确保路径与文件夹结构一致。')) {
    return
  }

  try {
    fixingPaths.value = true
    const result = await $fetch<{ success: boolean, fixed: number, errors: number }>('/api/documents/fix-paths', {
      method: 'POST'
    })
    
    if (result.success) {
      alert(`路径修复完成！修复了 ${result.fixed} 个项目，${result.errors} 个错误。`)
      await loadTree()
    }
  } catch (error: any) {
    console.error('修复路径失败:', error)
    alert(error.message || '修复路径失败，请稍后重试')
  } finally {
    fixingPaths.value = false
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
        <UButton
          icon="i-lucide-wrench"
          size="sm"
          variant="ghost"
          color="warning"
          :loading="fixingPaths"
          @click="handleFixPaths"
        >
          修复路径
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
      v-if="loading && treeItems.length === 0"
      class="flex justify-center py-12"
    >
      <UIcon
        name="i-lucide-loader-2"
        class="w-6 h-6 animate-spin"
      />
    </div>

    <!-- 空状态 -->
    <div
      v-else-if="treeItems.length === 0"
      class="text-center py-12 text-gray-500"
    >
      {{ documentsData?.noDocuments || '还没有文档，开始创建你的第一个文档吧！' }}
    </div>

    <!-- 树形视图 -->
    <div
      v-else
      class="border border-gray-200 dark:border-gray-700 rounded-lg p-2 bg-white dark:bg-gray-900"
    >
      <UTree
        v-model:expanded="expanded"
        :items="treeItems"
        :get-key="(item) => item.id"
        nested
        color="neutral"
      >
        <template #item-label="{ item }">
          <div
            :class="[
              'flex items-center gap-2 w-full group cursor-pointer',
              draggedItemId === item.id ? 'opacity-50' : '',
              dragOverItemId === item.id && dragOverPosition === 'inside' ? 'bg-blue-100 dark:bg-blue-900 rounded' : ''
            ]"
            :draggable="true"
            @dragstart="handleDragStart($event, item as ExtendedTreeItem)"
            @dragover="handleDragOver($event, item as ExtendedTreeItem)"
            @dragleave="handleDragLeave"
            @drop="handleDrop($event, item as ExtendedTreeItem)"
            @dragend="handleDragEnd"
            @click="handleNodeClick(item as ExtendedTreeItem)"
          >
            <span class="flex-1 truncate">
              <span
                v-if="renamingId !== item.id"
              >
                {{ item.label }}
              </span>
              <div
                v-else
                class="flex items-center gap-1"
                @click.stop
              >
                <UInput
                  v-model="renameInput"
                  size="xs"
                  class="flex-1"
                  autofocus
                  @keyup.enter="handleRename(item.id)"
                  @keyup.esc="handleCancelRename"
                  @click.stop
                />
                <UButton
                  icon="i-lucide-check"
                  size="xs"
                  color="primary"
                  :loading="renamingLoadingId === item.id"
                  @click.stop="handleRename(item.id)"
                />
                <UButton
                  icon="i-lucide-x"
                  size="xs"
                  variant="ghost"
                  @click.stop="handleCancelRename"
                />
              </div>
            </span>
            
            <!-- 操作按钮 -->
            <div
              v-if="renamingId !== item.id"
              class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
              @click.stop
            >
              <UButton
                icon="i-lucide-pencil"
                size="xs"
                variant="ghost"
                color="neutral"
                @click.stop="handleStartRename(item.id, item.label || '')"
              />
              <UButton
                icon="i-lucide-trash-2"
                size="xs"
                variant="ghost"
                color="error"
                :loading="deletingId === item.id"
                @click.stop="handleDelete(item.id, $event)"
              />
            </div>
          </div>
        </template>
      </UTree>
    </div>
  </div>
</template>
