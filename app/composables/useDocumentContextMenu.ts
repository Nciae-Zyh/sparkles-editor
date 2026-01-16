import type { Document } from '~/types'
import type { ContextMenuItem } from '@nuxt/ui'

export interface UseDocumentContextMenuOptions {
  /**
   * 打开文档/文件夹的回调
   */
  onOpen?: (item: Document) => void
  /**
   * 重命名的回调
   */
  onRename?: (item: Document) => void
  /**
   * 删除的回调
   */
  onDelete?: (item: Document, event: Event) => void
  /**
   * 创建文档的回调
   */
  onCreateDocument?: (parentId?: string | null) => void
  /**
   * 创建文件夹的回调
   */
  onCreateFolder?: (parentId?: string | null) => void
  /**
   * 下载文档的回调（仅文档）
   */
  onDownload?: (item: Document, event: Event) => void
  /**
   * 当前父文件夹ID（用于在空白处创建时指定父文件夹）
   * 可以是值、ref 或 computed
   */
  currentParentId?: string | null | (() => string | null | undefined) | Ref<string | null | undefined>
}

/**
 * 文档右键菜单 composable
 * 提供统一的右键菜单配置，支持文件、文件夹和空白区域的不同菜单
 */
export const useDocumentContextMenu = (options: UseDocumentContextMenuOptions = {}) => {
  const {
    onOpen,
    onRename,
    onDelete,
    onCreateDocument,
    onCreateFolder,
    onDownload,
    currentParentId = null
  } = options
  const { tm: $tm } = useNuxtApp().$i18n

  const documentsData = computed(() => $tm('documents') as Record<string, any> | undefined)
  const contextMenuData = computed(() => documentsData.value?.contextMenu || {})

  /**
   * 获取文件夹的右键菜单项
   */
  const getFolderMenuItems = (folder: Document): ContextMenuItem[][] => {
    const items: ContextMenuItem[][] = []

    // 打开文件夹
    if (onOpen) {
      items.push([
        {
          label: contextMenuData.value.open || '打开',
          icon: 'i-lucide-folder-open',
          onSelect: () => onOpen(folder)
        }
      ])
    }

    // 重命名
    if (onRename) {
      items.push([
        {
          label: contextMenuData.value.rename || '重命名',
          icon: 'i-lucide-pencil',
          onSelect: () => onRename(folder)
        }
      ])
    }

    // 在文件夹内创建子文件夹
    if (onCreateFolder) {
      items.push([
        {
          label: contextMenuData.value.newFolder || '新建文件夹',
          icon: 'i-lucide-folder-plus',
          onSelect: () => onCreateFolder(folder.id)
        }
      ])
    }

    // 删除
    if (onDelete) {
      items.push([
        {
          label: contextMenuData.value.delete || '删除',
          icon: 'i-lucide-trash-2',
          color: 'error' as const,
          onSelect: (e: Event) => onDelete(folder, e)
        }
      ])
    }

    return items
  }

  /**
   * 获取文档的右键菜单项
   */
  const getDocumentMenuItems = (doc: Document): ContextMenuItem[][] => {
    const items: ContextMenuItem[][] = []

    // 打开文档
    if (onOpen) {
      items.push([
        {
          label: contextMenuData.value.open || '打开',
          icon: 'i-lucide-file-text',
          onSelect: () => onOpen(doc)
        }
      ])
    }

    // 重命名
    if (onRename) {
      items.push([
        {
          label: contextMenuData.value.rename || '重命名',
          icon: 'i-lucide-pencil',
          onSelect: () => onRename(doc)
        }
      ])
    }

    // 下载（仅文档）
    if (onDownload && doc.type === 'document') {
      items.push([
        {
          label: contextMenuData.value.download || '下载',
          icon: 'i-lucide-download',
          onSelect: (e: Event) => onDownload(doc, e)
        }
      ])
    }

    // 删除
    if (onDelete) {
      items.push([
        {
          label: contextMenuData.value.delete || '删除',
          icon: 'i-lucide-trash-2',
          color: 'error' as const,
          onSelect: (e: Event) => onDelete(doc, e)
        }
      ])
    }

    return items
  }

  /**
   * 获取空白区域的右键菜单项
   */
  const getEmptyAreaMenuItems = computed((): ContextMenuItem[][] => {
    const items: ContextMenuItem[][] = []
    const parentId = typeof currentParentId === 'function' ? currentParentId() : currentParentId

    // 新建文档
    if (onCreateDocument) {
      items.push([
        {
          label: contextMenuData.value.newDocument || '新建文档',
          icon: 'i-lucide-file-plus',
          onSelect: () => onCreateDocument(parentId)
        }
      ])
    }

    // 新建文件夹
    if (onCreateFolder) {
      items.push([
        {
          label: contextMenuData.value.newFolder || '新建文件夹',
          icon: 'i-lucide-folder-plus',
          onSelect: () => onCreateFolder(parentId)
        }
      ])
    }

    return items
  })

  return {
    getFolderMenuItems,
    getDocumentMenuItems,
    getEmptyAreaMenuItems
  }
}
