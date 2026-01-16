<script lang="ts" setup>
import type { TreeItem } from '@nuxt/ui'
import type { Document } from '~/types'
import { useDocuments } from '~/composables/useDocuments'
import { useDocumentContextMenu } from '~/composables/useDocumentContextMenu'
import { useSafeLocalePath } from '~/utils/safeLocalePath'
import { useDownloadZip } from '~/composables/useDownloadZip'

interface ExtendedTreeItem extends TreeItem {
  id: string
  type: 'document' | 'folder'
  children?: ExtendedTreeItem[]
  _loaded?: boolean // 标记是否已加载子项
}

interface Props {
  compact?: boolean // 紧凑模式：使用下拉菜单，隐藏标题和按钮区域
}

const {
  fetchDocuments,
  deleteDocument,
  createFolder,
  createEmptyDocument,
  renameDocument,
  moveDocument,
  getDocument,
  fetchFolderChildren
} = useDocuments()
const {
  downloadAsZip,
  isDownloading
} = useDownloadZip()
const router = useRouter()
const safeLocalePath = useSafeLocalePath()

const actionsData = computed(() => $tm('actions') as Record<string, string> | undefined)
const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)

const treeItems = ref<ExtendedTreeItem[]>([])
const loading = ref(false)
const expanded = ref<string[]>([])
const loadingFolders = ref<Set<string>>(new Set()) // 正在加载的文件夹
const movingDocument = ref(false) // 正在移动文档的全局 loading 状态
const deletingId = ref<string | null>(null)
const renamingId = ref<string | null>(null)
const renamingLoadingId = ref<string | null>(null)
const downloadingId = ref<string | null>(null)
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

// 拖放相关状态
const draggedItemId = ref<string | null>(null)
const dragOverItemId = ref<string | null>(null)
const dragOverPosition = ref<'before' | 'after' | 'inside' | 'root' | null>(null)
const dragOverRoot = ref(false) // 是否拖动到根目录区域

// 将 Document 转换为 TreeItem 格式
const convertToTreeItem = (doc: Document): ExtendedTreeItem => {
  const item: ExtendedTreeItem = {
    id: doc.id,
    label: doc.title || (documentsData.value?.untitled || '未命名'),
    type: doc.type,
    icon: doc.type === 'folder' ? 'i-lucide-folder' : 'i-lucide-file-text',
    // 文件夹默认设置为空数组，这样 UTree 会显示展开图标
    // 文档不设置 children
    children: doc.type === 'folder' ? [] : undefined,
    _loaded: false
  }
  return item
}

// 加载根目录的文档和文件夹
const loadRootItems = async () => {
  try {
    loading.value = true
    const docs = await fetchDocuments() // 不传 parentId，获取根目录
    treeItems.value = docs.map(convertToTreeItem)
  } catch (error) {
    console.error('Failed to load root items:', error)
  } finally {
    loading.value = false
  }
}

// 懒加载文件夹的子项
const loadFolderChildren = async (folderId: string, item: ExtendedTreeItem, forceReload = false) => {
  // 如果已加载且不是强制刷新，直接返回
  if (item._loaded && !forceReload) {
    return
  }

  try {
    loadingFolders.value.add(folderId)
    const children = await fetchFolderChildren(folderId)

    // 更新树项的子项
    // 即使子项为空，也设置为空数组，这样会显示为空文件夹
    item.children = children.length > 0 ? children.map(convertToTreeItem) : []
    item._loaded = true
  } catch (error) {
    console.error('Failed to load folder children:', error)
    alert('加载文件夹内容失败，请稍后重试')
    // 加载失败时，保持为空数组，这样用户仍然可以看到文件夹是可展开的
    item.children = []
    item._loaded = true
  } finally {
    loadingFolders.value.delete(folderId)
  }
}

// 刷新所有已展开的文件夹
const refreshExpandedFolders = async () => {
  const refreshFolder = async (items: ExtendedTreeItem[]) => {
    for (const item of items) {
      if (item.type === 'folder' && expanded.value.includes(item.id)) {
        // 强制重新加载
        await loadFolderChildren(item.id, item, true)
        // 如果文件夹有子项，递归刷新
        if (item.children && item.children.length > 0) {
          await refreshFolder(item.children)
        }
      } else if (item.children && item.children.length > 0) {
        // 即使当前文件夹未展开，也要检查其子项
        await refreshFolder(item.children)
      }
    }
  }
  // 刷新根目录
  await loadRootItems()
  // 刷新所有已展开的文件夹
  await refreshFolder(treeItems.value)
}

// 处理节点展开/折叠（通过 watch expanded 来处理）
watch(expanded, async (newExpanded, oldExpanded) => {
  // 找出新展开的文件夹
  const newlyExpanded = newExpanded.filter(id => !oldExpanded.includes(id))

  for (const folderId of newlyExpanded) {
    const item = findItemInTree(treeItems.value, folderId)
    if (item && item.type === 'folder' && !item._loaded) {
      // 展开时加载子项
      await loadFolderChildren(folderId, item)
    }
  }
}, { immediate: false })

// 注意：节点点击现在在模板中直接处理
// 文件夹的展开/折叠由 UTree 自动处理
// 文档的点击在 item-label slot 中处理

// 展开/折叠所有
const expandAll = async () => {
  const expandFolder = async (items: ExtendedTreeItem[]) => {
    for (const item of items) {
      if (item.type === 'folder') {
        if (!expanded.value.includes(item.id)) {
          expanded.value.push(item.id)
          if (!item._loaded) {
            await loadFolderChildren(item.id, item)
          }
          if (item.children) {
            await expandFolder(item.children)
          }
        }
      }
    }
  }
  await expandFolder(treeItems.value)
}

const collapseAll = () => {
  expanded.value = []
}

// 处理删除
const handleDelete = async (id: string, event: Event) => {
  event.stopPropagation()
  const item = findItemInTree(treeItems.value, id)
  const itemType = item?.type === 'folder' ? (documentsData.value?.folder || '文件夹') : (documentsData.value?.document || '文档')
  const deleteConfirm = documentsData.value?.deleteConfirm?.replace('{type}', itemType) || `确定要删除这个${itemType}吗？`
  const deleteWarning = item?.type === 'folder' ? (documentsData.value?.deleteFolderWarning || '文件夹内的所有内容也会被删除。') : ''

  if (!confirm(`${deleteConfirm}${deleteWarning}`)) {
    return
  }

  try {
    deletingId.value = id
    await deleteDocument(id)
    // 从树中移除该项
    removeItemFromTree(treeItems.value, id)
  } catch (error: any) {
    alert(error.message || documentsData.value?.deleteFailed || '删除失败')
  } finally {
    deletingId.value = null
  }
}

// 处理创建文档（空文档）
const handleCreateDocument = async () => {
  if (!newDocumentName.value.trim()) {
    alert(documentsData.value?.enterDocumentName || '请输入文档名称')
    return
  }

  try {
    creatingDocument.value = true
    const savedParentId = createDocumentParentId.value // 保存 parentId，因为后面会被清空
    const document = await createEmptyDocument(newDocumentName.value.trim(), savedParentId || undefined)
    newDocumentName.value = ''
    createDocumentParentId.value = null
    showCreateDocument.value = false

    // 如果是在根目录创建，添加到根列表
    if (!savedParentId) {
      treeItems.value.unshift(convertToTreeItem(document))
    } else {
      // 如果是在某个文件夹内创建，需要找到该文件夹并添加
      const parentItem = findItemInTree(treeItems.value, savedParentId)
      if (parentItem && parentItem.type === 'folder') {
        // 确保父文件夹已加载，如果没有加载则先加载
        if (!parentItem._loaded) {
          await loadFolderChildren(savedParentId, parentItem)
        }
        // 确保 children 数组存在
        if (!parentItem.children) {
          parentItem.children = []
        }
        parentItem.children.push(convertToTreeItem(document))
      }
    }

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

// 处理创建文件夹
const handleCreateFolder = async () => {
  if (!newFolderName.value.trim()) {
    alert(documentsData.value?.enterFolderName || '请输入文件夹名称')
    return
  }

  try {
    creatingFolder.value = true
    const savedParentId = selectedParentId.value // 保存 parentId，因为后面会被清空
    const folder = await createFolder(newFolderName.value.trim(), savedParentId || undefined)
    newFolderName.value = ''
    selectedParentId.value = null
    showCreateFolder.value = false

    // 如果是在根目录创建，添加到根列表
    if (!savedParentId) {
      treeItems.value.unshift(convertToTreeItem(folder))
    } else {
      // 如果是在某个文件夹内创建，需要找到该文件夹并添加
      const parentItem = findItemInTree(treeItems.value, savedParentId)
      if (parentItem && parentItem.type === 'folder') {
        // 确保父文件夹已加载，如果没有加载则先加载
        if (!parentItem._loaded) {
          await loadFolderChildren(savedParentId, parentItem)
        }
        // 确保 children 数组存在
        if (!parentItem.children) {
          parentItem.children = []
        }
        parentItem.children.push(convertToTreeItem(folder))
      }
    }
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
    alert(documentsData.value?.pleaseEnterTitle || '请输入名称')
    return
  }

  const id = renamingId.value
  const newTitle = renameInput.value.trim()

  // 验证标题不能包含路径分隔符
  if (newTitle.includes('/') || newTitle.includes('\\')) {
    alert(documentsData.value?.titleCannotContainPath || '标题不能包含路径分隔符（/ 或 \\）')
    return
  }

  try {
    renamingLoadingId.value = id
    await renameDocument(id, newTitle)

    // 更新树中的标签
    const item = findItemInTree(treeItems.value, id)
    if (item) {
      item.label = newTitle
    }

    handleCancelRename()

    // 发布重命名通知，通知编辑页面更新
    const nuxtApp = useNuxtApp()
    if (nuxtApp.$publishNotification) {
      nuxtApp.$publishNotification('document:renamed', {
        id,
        title: newTitle
      })
    }
  } catch (error: any) {
    console.error('重命名失败:', error)
    alert(error.message || documentsData.value?.renameFailed || '重命名失败，请稍后重试')
  } finally {
    renamingLoadingId.value = null
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

    // 生成文件名
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

// 从树中移除项目
const removeItemFromTree = (items: ExtendedTreeItem[], id: string): boolean => {
  for (let i = 0; i < items.length; i++) {
    if (items[i].id === id) {
      items.splice(i, 1)
      return true
    }
    if (items[i].children) {
      if (removeItemFromTree(items[i].children!, id)) {
        return true
      }
    }
  }
  return false
}

// 检查是否是子项（防止循环引用）
const isDescendant = (parentId: string, childId: string): boolean => {
  if (parentId === childId) return true

  const parent = findItemInTree(treeItems.value, parentId)
  if (!parent || !parent.children) return false

  const checkChildren = (items: ExtendedTreeItem[], visited: Set<string> = new Set()): boolean => {
    if (visited.has(parentId)) return false
    visited.add(parentId)

    for (const item of items) {
      if (item.id === childId) return true
      if (item.children) {
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
  if (draggedItemId.value) {
    if (draggedItemId.value === item.id) {
      dragOverItemId.value = null
      dragOverPosition.value = null
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'none'
      }
      return
    }

    if (item.type === 'folder' && isDescendant(draggedItemId.value, item.id)) {
      dragOverItemId.value = null
      dragOverPosition.value = null
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'none'
      }
      return
    }
  }

  dragOverItemId.value = item.id

  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const y = event.clientY - rect.top
  const height = rect.height

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
      // 拖动到文件夹内时，自动展开该文件夹（延迟展开，避免频繁触发）
      if (!expanded.value.includes(item.id)) {
        // 使用 nextTick 确保在下一个事件循环中展开，避免阻塞拖拽
        nextTick(() => {
          if (!expanded.value.includes(item.id)) {
            expanded.value.push(item.id)
            // 如果文件夹未加载，异步加载其子项
            const folderItem = findItemInTree(treeItems.value, item.id)
            if (folderItem && !folderItem._loaded) {
              loadFolderChildren(item.id, folderItem)
            }
          }
        })
      }
    }
  } else {
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

  // 防止将文件夹移动到自己的子文件夹中
  if (draggedItemId.value) {
    if (draggedItemId.value === targetItem.id) {
      alert('不能将项目移动到自己的位置')
      dragOverItemId.value = null
      dragOverPosition.value = null
      draggedItemId.value = null
      return
    }

    if (targetItem.type === 'folder' && isDescendant(draggedItemId.value, targetItem.id)) {
      alert('不能将文件夹移动到自己的子文件夹中')
      dragOverItemId.value = null
      dragOverPosition.value = null
      draggedItemId.value = null
      return
    }
  }

  try {
    movingDocument.value = true
    let newParentId: string | null = null

    // 如果拖动到文件夹内，确保该文件夹已展开
    if (dragOverPosition.value === 'inside' && targetItem.type === 'folder') {
      newParentId = targetItem.id
      // 确保目标文件夹已展开
      if (!expanded.value.includes(targetItem.id)) {
        expanded.value.push(targetItem.id)
        // 如果文件夹未加载，先加载其子项
        const folderItem = findItemInTree(treeItems.value, targetItem.id)
        if (folderItem && !folderItem._loaded) {
          await loadFolderChildren(targetItem.id, folderItem)
        }
      }
    } else {
      // 找到目标项的父文件夹
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

    const draggedItem = findItemInTree(treeItems.value, draggedItemId.value)
    if (draggedItem?.type === 'folder' && targetItem.type === 'folder' && dragOverPosition.value !== 'before' && dragOverPosition.value !== 'after') {
      newParentId = targetItem.id
    }

    // 记录移动前的父文件夹ID（用于刷新）
    const oldParentId = draggedItem
      ? (() => {
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
          const parent = findParent(treeItems.value, draggedItemId.value)
          return parent?.id || null
        })()
      : null

    await moveDocument(draggedItemId.value, newParentId)

    // 更新树结构
    const item = findItemInTree(treeItems.value, draggedItemId.value)
    if (item) {
      // 从原位置移除
      removeItemFromTree(treeItems.value, draggedItemId.value)

      // 添加到新位置
      if (newParentId) {
        const parentItem = findItemInTree(treeItems.value, newParentId)
        if (parentItem && parentItem.type === 'folder') {
          if (!parentItem.children) {
            parentItem.children = []
          }
          parentItem.children.push(item)
        }
      } else {
        // 添加到根目录
        treeItems.value.push(item)
      }
    }

    // 刷新所有已展开的文件夹（包括原位置和新位置的父文件夹）
    await refreshExpandedFolders()
  } catch (error: any) {
    console.error('移动失败:', error)
    alert(error.message || '移动失败，请稍后重试')
  } finally {
    movingDocument.value = false
    dragOverItemId.value = null
    dragOverPosition.value = null
    draggedItemId.value = null
  }
}

const handleDragEnd = () => {
  dragOverItemId.value = null
  dragOverPosition.value = null
  dragOverRoot.value = false
  draggedItemId.value = null
}

// 处理拖动到根目录区域
const handleRootDragOver = (event: DragEvent) => {
  if (!draggedItemId.value) {
    return
  }
  event.preventDefault()
  event.stopPropagation()
  dragOverRoot.value = true
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

const handleRootDragLeave = () => {
  dragOverRoot.value = false
}

const handleRootDrop = async (event: DragEvent) => {
  event.preventDefault()
  event.stopPropagation()

  if (!draggedItemId.value) {
    dragOverRoot.value = false
    return
  }

  try {
    movingDocument.value = true
    // 记录移动前的父文件夹ID（用于刷新）
    const draggedItem = findItemInTree(treeItems.value, draggedItemId.value)
    const oldParentId = draggedItem
      ? (() => {
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
          const parent = findParent(treeItems.value, draggedItemId.value)
          return parent?.id || null
        })()
      : null

    // 移动到根目录（parentId 为 null）
    await moveDocument(draggedItemId.value, null)

    // 更新树结构
    const item = findItemInTree(treeItems.value, draggedItemId.value)
    if (item) {
      // 从原位置移除
      removeItemFromTree(treeItems.value, draggedItemId.value)
      // 添加到根目录
      treeItems.value.push(item)
    }

    // 刷新所有已展开的文件夹
    await refreshExpandedFolders()
  } catch (error: any) {
    console.error('移动到根目录失败:', error)
    alert(error.message || '移动到根目录失败，请稍后重试')
  } finally {
    movingDocument.value = false
    dragOverItemId.value = null
    dragOverPosition.value = null
    dragOverRoot.value = false
    draggedItemId.value = null
  }
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
      await loadRootItems()
    }
  } catch (error: any) {
    console.error('修复路径失败:', error)
    alert(error.message || '修复路径失败，请稍后重试')
  } finally {
    fixingPaths.value = false
  }
}
// 将 ExtendedTreeItem 转换为 Document
const treeItemToDocument = (item: ExtendedTreeItem): Document => {
  return {
    id: item.id,
    user_id: '', // UTree 中没有这个字段，但不影响右键菜单使用
    title: item.label || '',
    r2_key: '',
    parent_id: null,
    type: item.type,
    created_at: 0,
    updated_at: 0
  }
}

// 使用右键菜单 composable
const { getFolderMenuItems, getDocumentMenuItems, getEmptyAreaMenuItems } = useDocumentContextMenu({
  onOpen: (item: Document) => {
    if (item.type === 'folder') {
      // 文件夹的展开/折叠由 UTree 自动处理
      const folderId = item.id
      if (!expanded.value.includes(folderId)) {
        expanded.value.push(folderId)
      } else {
        expanded.value = expanded.value.filter(id => id !== folderId)
      }
    } else {
      // 文档点击打开编辑页面
      if (renamingId.value !== item.id) {
        navigateTo(`${safeLocalePath('/documents')}/${item.id}`)
      }
    }
  },
  onRename: (item: Document) => {
    const treeItem = findItemInTree(treeItems.value, item.id)
    if (treeItem) {
      handleStartRename(item.id, treeItem.label || '')
    }
  },
  onDelete: (item: Document, event: Event) => {
    handleDelete(item.id, event)
  },
  onCreateDocument: (parentId?: string | null) => {
    openCreateDocumentModal(parentId)
  },
  onCreateFolder: (parentId?: string | null) => {
    // 如果提供了 parentId，使用它；否则保持当前的 selectedParentId（可能是 null）
    selectedParentId.value = parentId !== undefined ? parentId : null
    showCreateFolder.value = true
  },
  onDownload: (item: Document, event: Event) => {
    if (item.type === 'document') {
      handleDownload(item.id, event)
    }
  },
  currentParentId: () => null
})

// 获取树节点的菜单项
const getTreeItemMenuItems = (item: ExtendedTreeItem) => {
  const doc = treeItemToDocument(item)
  return item.type === 'folder' ? getFolderMenuItems(doc) : getDocumentMenuItems(doc)
}

const onSelect = (e, item) => {
  // 处理文档点击，打开编辑页面
  const treeItem = item as ExtendedTreeItem
  if (treeItem.type === 'document' && renamingId.value !== treeItem.id) {
    e.preventDefault()
    navigateTo(`${safeLocalePath('/documents')}/${treeItem.id}`)
  }
  // 文件夹的点击让 UTree 自动处理展开/折叠
}

const props = withDefaults(defineProps<Props>(), {
  compact: false
})

// 获取当前路由的文档ID，用于高亮显示
const route = useRoute()
const currentDocumentId = computed(() => {
  const id = route.params.id
  return id && typeof id === 'string' ? id : null
})

// 下拉菜单项
const dropdownItems = computed(() => [
  {
    label: documentsData.value?.newDocument || '新建文档',
    icon: 'i-lucide-file-plus',
    onSelect: () => {
      navigateTo(safeLocalePath('/'))
    }
  },
  {
    label: documentsData.value?.newFolder || '新建文件夹',
    icon: 'i-lucide-folder-plus',
    onSelect: () => {
      selectedParentId.value = null
      showCreateFolder.value = true
    }
  },
  {
    label: documentsData.value?.expandAll || '展开全部',
    icon: 'i-lucide-chevrons-down-up',
    onSelect: expandAll
  },
  {
    label: documentsData.value?.collapseAll || '折叠全部',
    icon: 'i-lucide-chevrons-up-down',
    onSelect: collapseAll
  },
  {
    label: '修复路径',
    icon: 'i-lucide-wrench',
    onSelect: handleFixPaths,
    disabled: fixingPaths.value
  }
])

onMounted(() => {
  loadRootItems()

  // 订阅编辑页面的重命名通知
  const nuxtApp = useNuxtApp()
  if (nuxtApp.$subscribeNotification) {
    const unsubscribe = nuxtApp.$subscribeNotification<{ id: string, title: string }>('document:renamed', (payload) => {
      // 如果重命名的是树中的某个文档，更新树中的标签
      if (payload && payload.id) {
        const item = findItemInTree(treeItems.value, payload.id)
        if (item) {
          item.label = payload.title
        }
      }
    })

    // 组件卸载时取消订阅
    onUnmounted(() => {
      unsubscribe()
    })
  }
})
</script>

<template>
  <div :class="compact ? '' : 'space-y-4'">
    <!-- 正常模式：标题和按钮区域 -->
    <div
      v-if="!compact"
      class="flex items-center justify-between gap-4"
    >
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
          :loading="fixingPaths"
          color="warning"
          icon="i-lucide-wrench"
          size="sm"
          variant="ghost"
          @click="handleFixPaths"
        >
          修复路径
        </UButton>
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

    <!-- 重命名模态框 -->
    <UModal
      v-model:open="showRenameModal"
      :title="documentsData?.rename || '重命名'"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <UFormField
          :label="documentsData?.name || '名称'"
          name="renameInput"
          required
        >
          <UInput
            v-model="renameInput"
            :placeholder="documentsData?.pleaseEnterTitle || '请输入名称'"
            autofocus
            @keyup.enter="handleRename"
          />
        </UFormField>
      </template>

      <template #footer="{ close }">
        <UButton
          color="neutral"
          variant="ghost"
          @click="handleCancelRename"
        >
          {{ actionsData?.cancel || '取消' }}
        </UButton>
        <UButton
          :loading="renamingLoadingId !== null"
          @click="handleRename"
        >
          {{ documentsData?.save || '保存' }}
        </UButton>
      </template>
    </UModal>

    <!-- 加载状态 -->
    <div
      v-if="loading && treeItems.length === 0"
      class="flex justify-center py-12"
    >
      <UIcon
        class="w-6 h-6 animate-spin"
        name="i-lucide-loader-2"
      />
    </div>

    <!-- 空状态 -->
    <UContextMenu
      v-else-if="treeItems.length === 0"
      :items="getEmptyAreaMenuItems"
    >
      <div class="text-center py-12 text-gray-500 cursor-context-menu">
        {{ documentsData?.noDocuments || '还没有文档，开始创建你的第一个文档吧！' }}
      </div>
    </UContextMenu>

    <!-- 树形视图 -->
    <div
      v-else
      class="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 relative"
    >
      <!-- 全局 loading 遮罩 -->
      <div
        v-if="movingDocument"
        class="absolute inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center"
      >
        <div class="flex flex-col items-center gap-2">
          <UIcon
            name="i-lucide-loader-2"
            class="w-8 h-8 animate-spin text-primary"
          />
          <span class="text-sm text-gray-600 dark:text-gray-400">
            {{ documentsData?.moving || '正在移动...' }}
          </span>
        </div>
      </div>

      <!-- 根目录拖放区域 -->
      <div
        :class="[
          'p-2 border-b border-gray-200 dark:border-gray-700 transition-colors',
          dragOverRoot ? 'bg-blue-100 dark:bg-blue-900' : ''
        ]"
        @dragover.prevent="handleRootDragOver"
        @dragleave="handleRootDragLeave"
        @drop.prevent="handleRootDrop"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <UIcon
              name="i-lucide-folder"
              class="w-4 h-4"
            />
            <span>{{ documentsData?.rootDirectory || '根目录' }}</span>
            <span
              v-if="dragOverRoot"
              class="text-xs text-blue-600 dark:text-blue-400"
            >
              {{ documentsData?.dropToRoot || '拖动到此处移动到根目录' }}
            </span>
          </div>
          <!-- 紧凑模式：下拉菜单 -->
          <div
            v-if="compact"
            class="flex-shrink-0"
          >
            <UDropdownMenu
              :items="dropdownItems"
              :content="{ align: 'end' }"
            >
              <UButton
                icon="i-lucide-more-vertical"
                size="xs"
                variant="ghost"
                color="neutral"
              />
            </UDropdownMenu>
          </div>
        </div>
      </div>
      <div class="p-2">
        <UTree
          v-model:expanded="expanded"
          :get-key="(item) => item.id"
          :items="treeItems"
          color="neutral"
          nested
          @select="onSelect"
        >
          <template #item="{ item, expanded }">
            <UContextMenu :items="getTreeItemMenuItems(item as ExtendedTreeItem)">
              <div
                :class="{
                  'bg-primary/30': currentDocumentId === item.id && item.type === 'document'
                }"
                class="flex items-center w-full justify-between">
                <div class="flex items-center gap-2">
                  <UIcon :name="item.icon" />
                  <div
                    :class="[
                      'flex items-center gap-2 w-full group min-h-[2rem] cursor-context-menu',
                      draggedItemId === item.id ? 'opacity-50' : '',
                      dragOverItemId === item.id && dragOverPosition === 'inside' ? 'bg-blue-100 dark:bg-blue-900 rounded' : ''
                    ]"
                    :draggable="true"
                    style="width: 100%;"
                    @click="(e) => {
                      // 文档的点击在 UTree 的 @select 事件中处理
                      // 这里只处理拖放相关的事件，不阻止点击事件传播
                    }"
                    @dragend="handleDragEnd"
                    @dragleave="handleDragLeave"
                    @dragover="handleDragOver($event, item as ExtendedTreeItem)"
                    @dragstart="handleDragStart($event, item as ExtendedTreeItem)"
                    @drop="handleDrop($event, item as ExtendedTreeItem)"
                  >
                    <!-- 加载指示器 -->
                    <div
                      v-if="item.type === 'folder' && loadingFolders.has(item.id)"
                      class="w-4 h-4"
                    >
                      <UIcon
                        class="w-4 h-4 animate-spin"
                        name="i-lucide-loader-2"
                      />
                    </div>

                    <span class="flex-1 truncate">
                      {{ item.label }}
                    </span>

                    <!-- 操作按钮 -->
                    <div
                      class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      @click.stop
                    >
                      <UButton
                        color="neutral"
                        icon="i-lucide-pencil"
                        size="xs"
                        variant="ghost"
                        @click.stop="handleStartRename(item.id, item.label || '')"
                      />
                      <UButton
                        v-if="item.type === 'document'"
                        :loading="downloadingId === item.id"
                        color="neutral"
                        icon="i-lucide-download"
                        size="xs"
                        variant="ghost"
                        @click.stop="handleDownload(item.id, $event)"
                      />
                      <UButton
                        :loading="deletingId === item.id"
                        color="error"
                        icon="i-lucide-trash-2"
                        size="xs"
                        variant="ghost"
                        @click.stop="handleDelete(item.id, $event)"
                      />
                    </div>
                  </div>
                </div>
                <UIcon
                  v-if="item.type === 'folder'"
                  :name="`i-lucide-chevron-up`"
                  :class="`${expanded ? 'rotate-180' : 'rotate-0'} duration-200`"
                />
              </div>
            </UContextMenu>
          </template>
        </UTree>
      </div>
    </div>
  </div>
</template>
