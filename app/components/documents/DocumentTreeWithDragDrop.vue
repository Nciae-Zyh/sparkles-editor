<script lang="ts" setup>
import type { TreeItem } from '@nuxt/ui'
import type { Document } from '~/types'
import { useDocuments } from '~/composables/useDocuments'
import { useDocumentContextMenu } from '~/composables/useDocumentContextMenu'
import { useSafeLocalePath } from '~/utils/safeLocalePath'
import { useDownloadZip } from '~/composables/useDownloadZip'

const { tm: $tm, t } = useI18n()

interface ExtendedTreeItem extends TreeItem {
  id: string
  type: 'document' | 'folder'
  children?: ExtendedTreeItem[]
  isFavorite?: boolean
  isPinned?: boolean
  tags?: string[]
  contentPreview?: string
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
  fetchFolderChildren,
  toggleFavorite,
  togglePin,
  updateTags,
  searchDocuments
} = useDocuments()
const {
  downloadAsZip
} = useDownloadZip()
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

const favoritingIds = ref<Set<string>>(new Set())
const pinningIds = ref<Set<string>>(new Set())

const searchKeyword = ref('')
const searchTag = ref('')
const searching = ref(false)
const searchResults = ref<ExtendedTreeItem[]>([])
const searchTimer = ref<ReturnType<typeof setTimeout> | null>(null)

const showTagModal = ref(false)
const tagInput = ref('')
const editingTagItemId = ref<string | null>(null)
const updatingTags = ref(false)

const getErrorMessage = (error: unknown) => {
  if (error && typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message
    if (typeof value === 'string') {
      return value
    }
  }
  return ''
}

// 将 Document 转换为 TreeItem 格式
const parseTags = (value: unknown): string[] => {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.map(item => String(item)).filter(Boolean)
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.map(item => String(item)).filter(Boolean)
      }
      return []
    } catch {
      return []
    }
  }
  return []
}

const sortTreeItems = (items: ExtendedTreeItem[]) => {
  items.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1
    if (!a.isPinned && b.isPinned) return 1
    if (a.isFavorite && !b.isFavorite) return -1
    if (!a.isFavorite && b.isFavorite) return 1
    if (a.type === 'folder' && b.type !== 'folder') return -1
    if (a.type !== 'folder' && b.type === 'folder') return 1
    return String(a.label || '').localeCompare(String(b.label || ''))
  })

  for (const item of items) {
    if (item.children?.length) {
      sortTreeItems(item.children)
    }
  }
}

const convertToTreeItem = (doc: Document): ExtendedTreeItem => {
  const item: ExtendedTreeItem = {
    id: doc.id,
    label: doc.title || (documentsData.value?.untitled || t('documents.untitled')),
    type: doc.type,
    isFavorite: !!doc.is_favorite,
    isPinned: !!doc.is_pinned,
    tags: parseTags(doc.tags),
    contentPreview: doc.content_preview || '',
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
    sortTreeItems(treeItems.value)
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
    if (item.children.length > 0) {
      sortTreeItems(item.children)
    }
    item._loaded = true
  } catch (error) {
    console.error('Failed to load folder children:', error)
    alert(documentsData.value?.loadFolderFailed || t('documents.loadFolderFailed'))
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
  const itemType = item?.type === 'folder' ? (documentsData.value?.folder || t('documents.folder')) : (documentsData.value?.document || t('documents.document'))
  const deleteConfirm = documentsData.value?.deleteConfirm?.replace('{type}', itemType) || t('documents.deleteConfirm', { type: itemType })
  const deleteWarning = item?.type === 'folder' ? (documentsData.value?.deleteFolderWarning || t('documents.deleteFolderWarning')) : ''

  if (!confirm(`${deleteConfirm}${deleteWarning}`)) {
    return
  }

  try {
    deletingId.value = id
    await deleteDocument(id)
    // 从树中移除该项
    removeItemFromTree(treeItems.value, id)
  } catch (error: unknown) {
    alert(getErrorMessage(error) || documentsData.value?.deleteFailed || t('documents.deleteFailed'))
  } finally {
    deletingId.value = null
  }
}

// 处理创建文档（空文档）
const handleCreateDocument = async () => {
  if (!newDocumentName.value.trim()) {
    alert(documentsData.value?.enterDocumentName || t('documents.enterDocumentName'))
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

// 处理创建文件夹
const handleCreateFolder = async () => {
  if (!newFolderName.value.trim()) {
    alert(documentsData.value?.enterFolderName || t('documents.enterFolderName'))
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
  } catch (error: unknown) {
    alert(getErrorMessage(error) || documentsData.value?.createFolderFailed || t('documents.createFolderFailed'))
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
  } catch (error: unknown) {
    console.error('重命名失败:', error)
    alert(getErrorMessage(error) || documentsData.value?.renameFailedRetry || documentsData.value?.renameFailed || t('documents.renameFailed'))
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
      alert(actionsData.value?.documentEmpty || t('actions.documentEmpty'))
      return
    }

    // 生成文件名
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

const updateTreeItem = (
  items: ExtendedTreeItem[],
  id: string,
  updater: (item: ExtendedTreeItem) => void
): boolean => {
  for (const item of items) {
    if (item.id === id) {
      updater(item)
      return true
    }
    if (item.children && updateTreeItem(item.children, id, updater)) {
      return true
    }
  }
  return false
}

const activeItems = computed(() => {
  if (searchKeyword.value.trim() || searchTag.value) {
    return searchResults.value
  }
  return treeItems.value
})

const allTags = computed(() => {
  const tags = new Set<string>()
  const walk = (items: ExtendedTreeItem[]) => {
    for (const item of items) {
      for (const tag of item.tags || []) {
        tags.add(tag)
      }
      if (item.children?.length) {
        walk(item.children)
      }
    }
  }
  walk(treeItems.value)
  return Array.from(tags).sort((a, b) => a.localeCompare(b))
})

const doSearch = async () => {
  const q = searchKeyword.value.trim()
  const tag = searchTag.value.trim()
  if (!q && !tag) {
    searchResults.value = []
    return
  }

  searching.value = true
  try {
    const results = await searchDocuments(q, tag || undefined)
    searchResults.value = results.map(convertToTreeItem)
  } catch (error) {
    console.error('Search failed:', error)
    searchResults.value = []
  } finally {
    searching.value = false
  }
}

watch([searchKeyword, searchTag], () => {
  if (searchTimer.value) {
    clearTimeout(searchTimer.value)
  }
  searchTimer.value = setTimeout(() => {
    doSearch()
  }, 250)
})

onUnmounted(() => {
  if (searchTimer.value) {
    clearTimeout(searchTimer.value)
    searchTimer.value = null
  }
})

interface HighlightPart {
  text: string
  highlighted: boolean
}

const getHighlightedParts = (text: string, keyword: string): HighlightPart[] => {
  const value = text || ''
  const q = keyword.trim()
  if (!q) {
    return [{ text: value, highlighted: false }]
  }

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(escaped, 'gi')
  const parts: HighlightPart[] = []
  let lastIndex = 0

  for (const match of value.matchAll(regex)) {
    const index = match.index ?? 0
    if (index > lastIndex) {
      parts.push({
        text: value.slice(lastIndex, index),
        highlighted: false
      })
    }

    parts.push({
      text: match[0],
      highlighted: true
    })
    lastIndex = index + match[0].length
  }

  if (lastIndex < value.length) {
    parts.push({
      text: value.slice(lastIndex),
      highlighted: false
    })
  }

  return parts
}

const displayPreviewParts = (item: ExtendedTreeItem) => {
  const preview = item.contentPreview || ''
  const short = preview.length > 120 ? `${preview.slice(0, 120)}...` : preview
  return getHighlightedParts(short, searchKeyword.value)
}

const displayTitleParts = (item: ExtendedTreeItem) => {
  return getHighlightedParts(String(item.label || ''), searchKeyword.value)
}

const parseTagInput = (value: string) => {
  return Array.from(new Set(
    value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
      .slice(0, 12)
  ))
}

const openTagModal = (item: ExtendedTreeItem, event: Event) => {
  event.stopPropagation()
  editingTagItemId.value = item.id
  tagInput.value = (item.tags || []).join(', ')
  showTagModal.value = true
}

const saveTagsForItem = async () => {
  if (!editingTagItemId.value) return
  const itemId = editingTagItemId.value
  const tags = parseTagInput(tagInput.value)

  updatingTags.value = true
  try {
    await updateTags(itemId, tags)
    updateTreeItem(treeItems.value, itemId, (item) => {
      item.tags = tags
    })
    const resultItem = searchResults.value.find(item => item.id === itemId)
    if (resultItem) {
      resultItem.tags = tags
    }
    showTagModal.value = false
  } catch (error) {
    console.error('Update tags failed:', error)
    alert(documentsData.value?.saveFailed || t('documents.saveFailed'))
  } finally {
    updatingTags.value = false
  }
}

const toggleFavoriteForItem = async (item: ExtendedTreeItem, event: Event) => {
  event.stopPropagation()
  if (favoritingIds.value.has(item.id)) return

  favoritingIds.value.add(item.id)
  try {
    const isFavorite = await toggleFavorite(item.id, !item.isFavorite)
    item.isFavorite = !!isFavorite
    updateTreeItem(treeItems.value, item.id, (target) => {
      target.isFavorite = !!isFavorite
    })
    sortTreeItems(treeItems.value)
  } catch (error) {
    console.error('Toggle favorite failed:', error)
    alert(documentsData.value?.saveFailed || t('documents.saveFailed'))
  } finally {
    favoritingIds.value.delete(item.id)
  }
}

const togglePinForItem = async (item: ExtendedTreeItem, event: Event) => {
  event.stopPropagation()
  if (pinningIds.value.has(item.id)) return

  pinningIds.value.add(item.id)
  try {
    const isPinned = await togglePin(item.id, !item.isPinned)
    item.isPinned = !!isPinned
    updateTreeItem(treeItems.value, item.id, (target) => {
      target.isPinned = !!isPinned
    })
    sortTreeItems(treeItems.value)
  } catch (error) {
    console.error('Toggle pin failed:', error)
    alert(documentsData.value?.saveFailed || t('documents.saveFailed'))
  } finally {
    pinningIds.value.delete(item.id)
  }
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
      alert(documentsData.value?.cannotMoveToSelf || t('documents.cannotMoveToSelf'))
      dragOverItemId.value = null
      dragOverPosition.value = null
      draggedItemId.value = null
      return
    }

    if (targetItem.type === 'folder' && isDescendant(draggedItemId.value, targetItem.id)) {
      alert(documentsData.value?.cannotMoveIntoSubfolder || t('documents.cannotMoveIntoSubfolder'))
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
  } catch (error: unknown) {
    console.error('移动失败:', error)
    alert(getErrorMessage(error) || documentsData.value?.moveFailed || t('documents.moveFailed'))
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
  } catch (error: unknown) {
    console.error('移动到根目录失败:', error)
    alert(getErrorMessage(error) || documentsData.value?.moveToRootFailed || t('documents.moveToRootFailed'))
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
  if (!confirm(documentsData.value?.fixPathsConfirm || t('documents.fixPathsConfirm'))) {
    return
  }

  try {
    fixingPaths.value = true
    const result = await $fetch<{ success: boolean, fixed: number, errors: number }>('/api/documents/fix-paths', {
      method: 'POST'
    })

    if (result.success) {
      alert((documentsData.value?.fixPathsSuccess || t('documents.fixPathsSuccess')).replace('{fixed}', String(result.fixed)).replace('{errors}', String(result.errors)))
      await loadRootItems()
    }
  } catch (error: unknown) {
    console.error('修复路径失败:', error)
    alert(getErrorMessage(error) || documentsData.value?.fixPathsFailed || t('documents.fixPathsFailed'))
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
  onOpen: async (item: Document) => {
    if (item.type === 'folder') {
      // 文件夹的展开/折叠，并加载子项
      const folderId = item.id
      const folderItem = findItemInTree(treeItems.value, folderId)

      if (!expanded.value.includes(folderId)) {
        // 展开文件夹
        expanded.value.push(folderId)
        // 如果文件夹还未加载，加载子项
        if (folderItem && folderItem.type === 'folder' && !folderItem._loaded) {
          await loadFolderChildren(folderId, folderItem)
        }
      } else {
        // 折叠文件夹
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

const onSelect = (event: Event, item: TreeItem) => {
  // 处理文档点击，打开编辑页面
  const treeItem = item as ExtendedTreeItem
  if (treeItem.type === 'document' && renamingId.value !== treeItem.id) {
    event.preventDefault()
    navigateTo(`${safeLocalePath('/documents')}/${treeItem.id}`)
  }
  // 文件夹的点击让 UTree 自动处理展开/折叠
}

withDefaults(defineProps<Props>(), {
  compact: false
})

// 获取当前路由的文档ID，用于高亮显示
const route = useRoute()
const currentDocumentId = computed(() => {
  const id = route.params.id
  return id && typeof id === 'string' ? id : null
})

// 监听当前文档ID变化，自动展开到该文档
watch(currentDocumentId, async (newDocId) => {
  if (newDocId && treeItems.value.length > 0) {
    // 等待树加载完成后再展开
    await nextTick()
    await expandToDocument(newDocId)
  }
}, { immediate: false })

// 展开到指定文档的路径（一层一层展开）
const expandToDocument = async (documentId: string) => {
  try {
    // 使用 API 获取文档的完整路径
    const response = await $fetch<{ path: string[], documentId: string }>(`/api/documents/${documentId}/path`)
    const path = response.path

    if (path.length === 0) {
      // 文档在根目录，无需展开
      return
    }

    // 从根目录开始，一层一层展开
    for (let i = 0; i < path.length; i++) {
      const folderId = path[i]

      // 如果文件夹还未展开，先展开它
      if (!expanded.value.includes(folderId)) {
        expanded.value.push(folderId)
      }

      // 找到文件夹项
      const folderItem = findItemInTree(treeItems.value, folderId)

      if (folderItem && folderItem.type === 'folder') {
        // 如果文件夹还未加载，先加载子项
        if (!folderItem._loaded) {
          await loadFolderChildren(folderId, folderItem)
        }

        // 等待一小段时间，确保 UI 更新
        await new Promise(resolve => setTimeout(resolve, 50))
      } else {
        // 如果找不到文件夹项，可能需要先加载父文件夹
        // 尝试从根目录重新查找
        if (i > 0) {
          // 如果当前文件夹不在树中，可能需要先展开父文件夹
          const parentFolderId = path[i - 1]
          const parentItem = findItemInTree(treeItems.value, parentFolderId)
          if (parentItem && parentItem.type === 'folder' && !parentItem._loaded) {
            await loadFolderChildren(parentFolderId, parentItem)
            // 重新查找当前文件夹
            const currentItem = findItemInTree(treeItems.value, folderId)
            if (currentItem && currentItem.type === 'folder' && !currentItem._loaded) {
              await loadFolderChildren(folderId, currentItem)
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to expand to document:', error)
    // 如果 API 失败，回退到原来的方法
    try {
      const document = await getDocument(documentId)
      if (!document || !document.parent_id) return

      // 递归获取所有父文件夹ID
      const parentIds: string[] = []
      let currentParentId: string | null = document.parent_id || null

      while (currentParentId) {
        parentIds.push(currentParentId)
        const parentDoc = await getDocument(currentParentId)
        if (!parentDoc) break
        currentParentId = parentDoc.parent_id || null
      }

      // 从根到文档，依次展开并加载文件夹
      for (let i = parentIds.length - 1; i >= 0; i--) {
        const folderId = parentIds[i]
        if (!expanded.value.includes(folderId)) {
          expanded.value.push(folderId)
          const folderItem = findItemInTree(treeItems.value, folderId)
          if (folderItem && folderItem.type === 'folder' && !folderItem._loaded) {
            await loadFolderChildren(folderId, folderItem)
            await new Promise(resolve => setTimeout(resolve, 50))
          }
        }
      }
    } catch (fallbackError) {
      console.error('Fallback expand method also failed:', fallbackError)
    }
  }
}

// 下拉菜单项
const dropdownItems = computed(() => [
  {
    label: documentsData.value?.newDocument || t('documents.newDocument'),
    icon: 'i-lucide-file-plus',
    onSelect: () => {
      openCreateDocumentModal()
    }
  },
  {
    label: documentsData.value?.newFolder || t('documents.newFolder'),
    icon: 'i-lucide-folder-plus',
    onSelect: () => {
      selectedParentId.value = null
      showCreateFolder.value = true
    }
  },
  {
    label: documentsData.value?.expandAll || t('documents.expandAll'),
    icon: 'i-lucide-chevrons-down-up',
    onSelect: expandAll
  },
  {
    label: documentsData.value?.collapseAll || t('documents.collapseAll'),
    icon: 'i-lucide-chevrons-up-down',
    onSelect: collapseAll
  },
  {
    label: documentsData.value?.fixPaths || t('documents.fixPaths'),
    icon: 'i-lucide-wrench',
    onSelect: handleFixPaths,
    disabled: fixingPaths.value
  }
])

onMounted(async () => {
  await loadRootItems()

  // 如果有当前文档ID，展开到该文档
  if (currentDocumentId.value) {
    await nextTick()
    await expandToDocument(currentDocumentId.value)
  }

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

// 监听路由变化，当切换到新文档时展开到该文档
watch(currentDocumentId, async (newId) => {
  if (newId) {
    await expandToDocument(newId)
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
        <UButton
          :loading="fixingPaths"
          color="warning"
          icon="i-lucide-wrench"
          size="sm"
          variant="ghost"
          @click="handleFixPaths"
        >
          {{ documentsData?.fixPaths || t('documents.fixPaths') }}
        </UButton>
      </div>
    </div>

    <div
      class="border border-default rounded-lg bg-default p-3 space-y-3"
    >
      <div class="flex items-center gap-2">
        <UInput
          v-model="searchKeyword"
          class="flex-1"
          icon="i-lucide-search"
          :placeholder="documentsData?.searchDocuments || t('documents.searchDocuments')"
        />
        <UButton
          size="sm"
          variant="soft"
          icon="i-lucide-x"
          :disabled="!searchKeyword && !searchTag"
          @click="() => { searchKeyword = ''; searchTag = '' }"
        >
          {{ actionsData?.clear || t('actions.clear') }}
        </UButton>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <UButton
          size="xs"
          :variant="searchTag ? 'ghost' : 'soft'"
          @click="searchTag = ''"
        >
          {{ documentsData?.allTags || t('documents.allTags') }}
        </UButton>
        <UButton
          v-for="tag in allTags"
          :key="tag"
          size="xs"
          :variant="searchTag === tag ? 'solid' : 'ghost'"
          color="neutral"
          @click="searchTag = searchTag === tag ? '' : tag"
        >
          #{{ tag }}
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

      <template #footer>
        <UButton
          color="neutral"
          variant="ghost"
          @click="showCreateDocument = false"
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

      <template #footer>
        <UButton
          color="neutral"
          variant="ghost"
          @click="showCreateFolder = false"
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

    <UModal
      v-model:open="showTagModal"
      :title="documentsData?.tags || t('documents.tags')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <UFormField
          :label="documentsData?.tags || t('documents.tags')"
          name="tags"
          :description="documentsData?.tagsInputDesc || t('documents.tagsInputDesc')"
        >
          <UInput
            v-model="tagInput"
            :placeholder="documentsData?.tagsPlaceholder || t('documents.tagsPlaceholder')"
            @keyup.enter="saveTagsForItem"
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
          :loading="updatingTags"
          @click="saveTagsForItem"
        >
          {{ documentsData?.save || t('documents.save') }}
        </UButton>
      </template>
    </UModal>

    <!-- 加载状态 -->
    <div
      v-if="(loading && treeItems.length === 0) || searching"
      class="flex justify-center py-12"
    >
      <UIcon
        class="w-6 h-6 animate-spin"
        name="i-lucide-loader-2"
      />
    </div>

    <!-- 空状态 -->
    <UContextMenu
      v-else-if="treeItems.length === 0 && !searchKeyword && !searchTag"
      :items="getEmptyAreaMenuItems"
    >
      <div class="text-center py-12 text-muted cursor-context-menu">
        {{ documentsData?.noDocuments || t('documents.noDocuments') }}
      </div>
    </UContextMenu>

    <!-- 树形视图 -->
    <div
      v-else
      class="border border-default rounded-lg bg-default relative"
    >
      <!-- 全局 loading 遮罩 -->
      <div
        v-if="movingDocument"
        class="absolute inset-0 bg-default/80 backdrop-blur-sm z-50 flex items-center justify-center"
      >
        <div class="flex flex-col items-center gap-2">
          <UIcon
            name="i-lucide-loader-2"
            class="w-8 h-8 animate-spin text-primary"
          />
          <span class="text-sm text-toned">
            {{ documentsData?.moving || t('documents.moving') }}
          </span>
        </div>
      </div>

      <!-- 根目录拖放区域 -->
      <div
        :class="[
          'p-2 border-b border-default transition-colors',
          dragOverRoot ? 'bg-primary/20' : ''
        ]"
        @dragover.prevent="handleRootDragOver"
        @dragleave="handleRootDragLeave"
        @drop.prevent="handleRootDrop"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 text-sm text-toned">
            <UIcon
              name="i-lucide-folder"
              class="w-4 h-4"
            />
            <span>{{ documentsData?.rootDirectory || t('documents.rootDirectory') }}</span>
            <span
              v-if="dragOverRoot"
              class="text-xs text-primary"
            >
              {{ documentsData?.dropToRoot || t('documents.dropToRoot') }}
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
        <div
          v-if="(searchKeyword || searchTag) && activeItems.length === 0"
          class="py-12 text-center text-muted text-sm"
        >
          {{ documentsData?.noSearchResult || t('documents.noSearchResult') }}
        </div>
        <UTree
          v-else
          v-model:expanded="expanded"
          :get-key="(item) => item.id"
          :items="activeItems"
          color="neutral"
          nested
          @select="onSelect"
        >
          <template #item="{ item, expanded: itemExpanded }">
            <UContextMenu :items="getTreeItemMenuItems(item as ExtendedTreeItem)">
              <div
                :class="{
                  'bg-primary/30': currentDocumentId === item.id && item.type === 'document',
                  'rounded-lg px-1': true
                }"
                class="flex items-center w-full justify-between"
              >
                <div class="flex items-center gap-2">
                  <UIcon :name="item.icon" />
                  <div
                    :class="[
                      'flex items-center gap-2 w-full group min-h-[2rem] cursor-context-menu',
                      draggedItemId === item.id ? 'opacity-50' : '',
                      dragOverItemId === item.id && dragOverPosition === 'inside' ? 'bg-primary/20 rounded' : ''
                    ]"
                    :draggable="true"
                    style="width: 100%;"
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

                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 min-w-0">
                        <span class="truncate">
                          <template
                            v-for="(part, partIndex) in displayTitleParts(item as ExtendedTreeItem)"
                            :key="`${item.id}-title-${partIndex}`"
                          >
                            <mark v-if="part.highlighted">{{ part.text }}</mark>
                            <span v-else>{{ part.text }}</span>
                          </template>
                        </span>
                        <UIcon
                          v-if="(item as ExtendedTreeItem).isPinned"
                          name="i-lucide-pin"
                          class="w-3 h-3 text-warning shrink-0"
                        />
                        <UIcon
                          v-if="(item as ExtendedTreeItem).isFavorite"
                          name="i-lucide-star"
                          class="w-3 h-3 text-yellow-500 shrink-0"
                        />
                      </div>
                      <p
                        v-if="searchKeyword && (item as ExtendedTreeItem).contentPreview"
                        class="text-xs text-muted truncate mt-0.5"
                      >
                        <template
                          v-for="(part, partIndex) in displayPreviewParts(item as ExtendedTreeItem)"
                          :key="`${item.id}-preview-${partIndex}`"
                        >
                          <mark v-if="part.highlighted">{{ part.text }}</mark>
                          <span v-else>{{ part.text }}</span>
                        </template>
                      </p>
                      <div
                        v-if="(item as ExtendedTreeItem).tags && (item as ExtendedTreeItem).tags?.length > 0"
                        class="flex flex-wrap gap-1 mt-1"
                      >
                        <span
                          v-for="tag in (item as ExtendedTreeItem).tags?.slice(0, 3)"
                          :key="`${item.id}-${tag}`"
                          class="text-[10px] px-1.5 py-0.5 rounded bg-muted text-toned"
                        >
                          #{{ tag }}
                        </span>
                      </div>
                    </div>

                    <!-- 操作按钮 -->
                    <div
                      class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      @click.stop
                    >
                      <UButton
                        :loading="pinningIds.has(item.id)"
                        color="neutral"
                        :icon="(item as ExtendedTreeItem).isPinned ? 'i-lucide-pin-off' : 'i-lucide-pin'"
                        size="xs"
                        variant="ghost"
                        @click.stop="togglePinForItem(item as ExtendedTreeItem, $event)"
                      />
                      <UButton
                        :loading="favoritingIds.has(item.id)"
                        color="neutral"
                        :icon="(item as ExtendedTreeItem).isFavorite ? 'i-lucide-star-off' : 'i-lucide-star'"
                        size="xs"
                        variant="ghost"
                        @click.stop="toggleFavoriteForItem(item as ExtendedTreeItem, $event)"
                      />
                      <UButton
                        color="neutral"
                        icon="i-lucide-tags"
                        size="xs"
                        variant="ghost"
                        @click.stop="openTagModal(item as ExtendedTreeItem, $event)"
                      />
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
                  :class="`${itemExpanded ? 'rotate-180' : 'rotate-0'} duration-200`"
                />
              </div>
            </UContextMenu>
          </template>
        </UTree>
      </div>
    </div>
  </div>
</template>
