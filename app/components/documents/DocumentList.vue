<script lang="ts" setup>
import { useDocuments } from '~/composables/useDocuments'
import type { Document } from '~/types'

interface Props {
  parentId?: string
}

const props = defineProps<Props>()

const { documents, loading, fetchDocuments, deleteDocument, createFolder } = useDocuments()
const router = useRouter()

const deletingId = ref<string | null>(null)
const currentParentId = ref(props.parentId)
const showCreateFolder = ref(false)
const newFolderName = ref('')
const creatingFolder = ref(false)

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
  const itemType = item?.type === 'folder' ? '文件夹' : '文档'

  if (!confirm(`确定要删除这个${itemType}吗？${item?.type === 'folder' ? '文件夹内的所有内容也会被删除。' : ''}`)) {
    return
  }

  try {
    deletingId.value = id
    await deleteDocument(id)
  } catch (error: any) {
    alert(error.message || '删除失败')
  } finally {
    deletingId.value = null
  }
}

const handleCreateFolder = async () => {
  if (!newFolderName.value.trim()) {
    alert('请输入文件夹名称')
    return
  }

  try {
    creatingFolder.value = true
    await createFolder(newFolderName.value.trim(), currentParentId.value)
    newFolderName.value = ''
    showCreateFolder.value = false
  } catch (error: any) {
    alert(error.message || '创建文件夹失败')
  } finally {
    creatingFolder.value = false
  }
}

const navigateToFolder = (folderId: string) => {
  router.push(`/documents?folder=${folderId}`)
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
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-4">
      <h2 class="text-xl font-semibold">
        文档列表
      </h2>
      <div class="flex gap-2">
        <UButton
          :to="currentParentId ? `/?folder=${currentParentId}` : '/'"
          icon="i-lucide-file-plus"
          size="sm"
          variant="soft"
        >
          新建文档
        </UButton>
        <UButton
          icon="i-lucide-folder-plus"
          size="sm"
          @click="showCreateFolder = true"
        >
          新建文件夹
        </UButton>
      </div>
    </div>

    <UModal
      v-model:open="showCreateFolder"
      title="新建文件夹"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <UFormGroup
          label="文件夹名称"
          name="folderName"
          required
        >
          <UInput
            v-model="newFolderName"
            placeholder="请输入文件夹名称"
            @keyup.enter="handleCreateFolder"
          />
        </UFormGroup>
      </template>

      <template #footer="{ close }">
        <UButton
          color="gray"
          variant="ghost"
          @click="close"
        >
          取消
        </UButton>
        <UButton
          :loading="creatingFolder"
          @click="handleCreateFolder"
        >
          创建
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

    <div
      v-else-if="documents.length === 0"
      class="text-center py-12 text-gray-500"
    >
      还没有文档，开始创建你的第一个文档吧！
    </div>

    <div
      v-else
      class="space-y-4"
    >
      <!-- 文件夹列表 -->
      <div
        v-if="folders.length > 0"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        <UCard
          v-for="folder in folders"
          :key="folder.id"
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
                color="red"
                variant="ghost"
                icon="i-lucide-trash-2"
                size="sm"
                :loading="deletingId === folder.id"
                @click="handleDelete(folder.id, $event)"
              />
            </div>
          </template>

          <div class="text-sm text-gray-500">
            文件夹
          </div>
        </UCard>
      </div>

      <!-- 文档列表 -->
      <div
        v-if="files.length > 0"
        class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        <UCard
          v-for="doc in files"
          :key="doc.id"
          class="cursor-pointer hover:shadow-lg transition-shadow"
          @click="router.push(`/documents/${doc.id}`)"
        >
          <template #header>
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-2 flex-1">
                <UIcon
                  name="i-lucide-file-text"
                  class="w-5 h-5 text-blue-500"
                />
                <h3 class="font-semibold text-lg truncate">
                  {{ doc.title || '未命名文档' }}
                </h3>
              </div>
              <UButton
                color="red"
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
              创建时间：{{ formatDate(doc.created_at) }}
            </div>
            <div>
              更新时间：{{ formatDate(doc.updated_at) }}
            </div>
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>
