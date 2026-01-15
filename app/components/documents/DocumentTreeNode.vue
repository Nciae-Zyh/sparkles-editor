<script lang="ts" setup>
import type { Document } from '~/types'

interface DocumentTreeNode extends Document {
  children?: DocumentTreeNode[]
}

interface Props {
  node: DocumentTreeNode
  level: number
  expandedFolders: Set<string>
  deletingId: string | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  toggle: [folderId: string]
  click: [node: DocumentTreeNode]
  delete: [id: string, event: Event]
  'create-sub-folder': [folderId: string, event: Event]
}>()

const isExpanded = computed(() => props.expandedFolders.has(props.node.id))
const hasChildren = computed(() => props.node.children && props.node.children.length > 0)

const handleClick = () => {
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
</script>

<template>
  <div class="select-none">
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
      <span class="flex-1 truncate text-sm">
        {{ node.title || '未命名' }}
      </span>

      <!-- 操作按钮 -->
      <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <UButton
          v-if="node.type === 'folder'"
          icon="i-lucide-folder-plus"
          size="xs"
          variant="ghost"
          color="neutral"
          @click="handleCreateSubFolder"
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

    <!-- 子节点 -->
    <div v-if="node.type === 'folder' && isExpanded && hasChildren">
      <DocumentTreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :level="level + 1"
        :expanded-folders="expandedFolders"
        :deleting-id="deletingId"
        @toggle="(id: string) => emit('toggle', id)"
        @click="(n: DocumentTreeNode) => emit('click', n)"
        @delete="(id: string, e: Event) => emit('delete', id, e)"
        @create-sub-folder="(id: string, e: Event) => emit('create-sub-folder', id, e)"
      />
    </div>
  </div>
</template>
