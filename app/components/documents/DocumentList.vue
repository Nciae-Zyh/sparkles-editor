<script lang="ts" setup>
import { useDocuments } from '~/composables/useDocuments'

const { documents, loading, fetchDocuments, deleteDocument } = useDocuments()
const router = useRouter()

const deletingId = ref<string | null>(null)

onMounted(() => {
  fetchDocuments()
})

const handleDelete = async (id: string, event: Event) => {
  event.stopPropagation()
  if (!confirm('确定要删除这个文档吗？')) {
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
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
    >
      <UCard
        v-for="doc in documents"
        :key="doc.id"
        class="cursor-pointer hover:shadow-lg transition-shadow"
        @click="router.push(`/documents/${doc.id}`)"
      >
        <template #header>
          <div class="flex items-start justify-between">
            <h3 class="font-semibold text-lg truncate flex-1">
              {{ doc.title || '未命名文档' }}
            </h3>
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
</template>
