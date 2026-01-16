<script lang="ts" setup>
import type { Document } from '~/types'
import { useDocumentContextMenu } from '~/composables/useDocumentContextMenu'

interface DocumentTreeNode extends Document {
  children?: DocumentTreeNode[]
}

interface Props {
  node: DocumentTreeNode
  level: number
  expandedFolders: Set<string>
  deletingId: string | null
  downloadingId: string | null
  renamingId: string | null
  renamingLoadingId: string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'toggle': [folderId: string]
  'click': [node: DocumentTreeNode]
  'delete': [id: string, event: Event]
  'create-sub-folder': [folderId: string, event: Event]
  'create-document': [folderId: string | null]
  'download': [id: string, event: Event]
  'rename': [id: string, newTitle: string]
  'start-rename': [id: string]
  'cancel-rename': []
}>()

const isRenaming = computed(() => props.renamingId === props.node.id)
const isRenamingLoading = computed(() => props.renamingLoadingId === props.node.id)
const renameInput = ref('')

const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)

const isExpanded = computed(() => props.expandedFolders.has(props.node.id))
const hasChildren = computed(() => props.node.children && props.node.children.length > 0)

const handleClick = () => {
  // 如果正在重命名，不触发点击事件（不跳转）
  if (isRenaming.value) {
    return
  }
  emit('click', props.node)
}

const handleToggle = (event: Event) => {
  event.stopPropagation()
  if (props.node.type === 'folder') {
    emit('toggle', props.node.id)
  }
}

const handleDelete = (event: Event) => {
  emit('delete', props.node.id, event)
}

const handleCreateSubFolder = (event: Event) => {
  emit('create-sub-folder', props.node.id, event)
}

const handleDownload = (event: Event) => {
  emit('download', props.node.id, event)
}

const handleStartRename = (event: Event) => {
  event.stopPropagation()
  renameInput.value = props.node.title
  emit('start-rename', props.node.id)
}

const handleSaveRename = () => {
  if (!renameInput.value.trim()) {
    alert(documentsData.value?.pleaseEnterTitle || '请输入名称')
    return
  }
  if (renameInput.value.trim() === props.node.title) {
    emit('cancel-rename')
    return
  }
  emit('rename', props.node.id, renameInput.value.trim())
}

const handleCancelRename = () => {
  emit('cancel-rename')
}

// 使用右键菜单 composable
const { getFolderMenuItems, getDocumentMenuItems } = useDocumentContextMenu({
  onOpen: (item: Document) => {
    emit('click', item as DocumentTreeNode)
  },
  onRename: (item: Document) => {
    emit('start-rename', item.id)
  },
  onDelete: (item: Document, event: Event) => {
    emit('delete', item.id, event)
  },
  onCreateDocument: (parentId?: string | null) => {
    emit('create-document', parentId || (props.node.type === 'folder' ? props.node.id : null))
  },
  onCreateFolder: (parentId?: string | null) => {
    emit('create-sub-folder', parentId || props.node.id, new Event('contextmenu'))
  },
  onDownload: (item: Document, event: Event) => {
    if (item.type === 'document') {
      emit('download', item.id, event)
    }
  }
})

// 根据节点类型获取菜单项
const getMenuItems = computed(() => {
  return props.node.type === 'folder'
    ? getFolderMenuItems(props.node)
    : getDocumentMenuItems(props.node)
})
</script>

<template>
  <div class="select-none">
    <UContextMenu :items="getMenuItems">
      <div
        class="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer group"
        :style="{ paddingLeft: `${level * 1.5 + 0.5}rem` }"
        @click="handleClick"
      >
        <!-- 展开/折叠图标 -->
        <div
          v-if="node.type === 'folder'"
          class="w-4 h-4 flex-shrink-0 flex items-center justify-center"
          @click="handleToggle"
        >
          <UIcon
            :name="isExpanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
            class="w-4 h-4 text-gray-400"
          />
        </div>
        <div
          v-else
          class="w-4 h-4 flex-shrink-0"
        />

        <!-- 文件夹/文档图标 -->
        <UIcon
          :name="node.type === 'folder' ? 'i-lucide-folder' : 'i-lucide-file-text'"
          :class="[
            'w-5 h-5 flex-shrink-0',
            node.type === 'folder' ? 'text-yellow-500' : 'text-blue-500'
          ]"
        />

        <!-- 标题 -->
        <span
          v-if="!isRenaming"
          class="flex-1 truncate text-sm"
        >
          {{ node.title || (documentsData?.untitled || '未命名') }}
        </span>
        <div
          v-else
          class="flex-1 flex items-center gap-1"
          @click.stop
        >
          <UInput
            v-model="renameInput"
            size="xs"
            class="flex-1"
            autofocus
            @keyup.enter="handleSaveRename"
            @keyup.esc="handleCancelRename"
            @click.stop
          />
          <UButton
            icon="i-lucide-check"
            size="xs"
            color="primary"
            @click.stop="handleSaveRename"
          />
          <UButton
            icon="i-lucide-x"
            size="xs"
            variant="ghost"
            @click.stop="handleCancelRename"
          />
        </div>

        <!-- 操作按钮 -->
        <div
          v-if="!isRenaming"
          class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <UButton
            icon="i-lucide-pencil"
            size="xs"
            variant="ghost"
            color="neutral"
            @click="handleStartRename"
          />
          <UButton
            v-if="node.type === 'folder'"
            icon="i-lucide-folder-plus"
            size="xs"
            variant="ghost"
            color="neutral"
            @click="handleCreateSubFolder"
          />
          <UButton
            v-if="node.type === 'document'"
            icon="i-lucide-download"
            size="xs"
            variant="ghost"
            color="neutral"
            :loading="downloadingId === node.id"
            @click="handleDownload"
          />
          <UButton
            icon="i-lucide-trash-2"
            size="xs"
            variant="ghost"
            color="error"
            :loading="deletingId === node.id"
            @click="handleDelete"
          />
        </div>
      </div>
    </UContextMenu>

    <!-- 子节点 -->
    <div v-if="node.type === 'folder' && isExpanded && hasChildren">
      <DocumentsDocumentTreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :level="level + 1"
        :expanded-folders="expandedFolders"
        :deleting-id="deletingId"
        :downloading-id="downloadingId"
        :renaming-id="renamingId"
        :renaming-loading-id="renamingLoadingId"
        @toggle="(id: string) => emit('toggle', id)"
        @click="(n: DocumentTreeNode) => emit('click', n)"
        @delete="(id: string, e: Event) => emit('delete', id, e)"
        @create-sub-folder="(id: string, e: Event) => emit('create-sub-folder', id, e)"
        @download="(id: string, e: Event) => emit('download', id, e)"
        @rename="(id: string, title: string) => emit('rename', id, title)"
        @start-rename="(id: string) => emit('start-rename', id)"
        @cancel-rename="() => emit('cancel-rename')"
      />
    </div>
  </div>
</template>
