<script lang="ts" setup>
import { useDocuments } from '~/composables/useDocuments'
import { useAuth } from '~/composables/useAuth'
import FolderSelector from './FolderSelector.vue'
import type { Document } from '~/types'

interface Props {
  title: string
  content: string
  documentId?: string
  defaultParentId?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  saved: [documentId: string]
}>()

const { saveDocument, fetchFolders, loading } = useDocuments()
const { user } = useAuth()

const isOpen = ref(false)
const titleInput = ref(props.title)
const selectedParentId = ref<string | undefined>(props.defaultParentId)
const saving = ref(false)

watch(() => props.title, (newTitle) => {
  titleInput.value = newTitle
})

watch(() => props.defaultParentId, (newParentId) => {
  selectedParentId.value = newParentId
})

const handleSave = async () => {
  if (!user.value) {
    alert('请先登录')
    return
  }

  if (!titleInput.value.trim()) {
    alert('请输入文档标题')
    return
  }

  try {
    saving.value = true
    const document = await saveDocument(
      titleInput.value.trim(),
      props.content,
      props.documentId,
      selectedParentId.value
    )
    emit('saved', document.id)
    isOpen.value = false
  } catch (error: any) {
    alert(error.message || '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <UButton
      :loading="loading"
      icon="i-lucide-save"
      @click="isOpen = true"
    >
      保存文档
    </UButton>

    <UModal v-model="isOpen">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">
            {{ documentId ? '更新文档' : '保存文档' }}
          </h3>
        </template>

        <div class="space-y-4">
          <UFormGroup
            label="文档标题"
            name="title"
            required
          >
            <UInput
              v-model="titleInput"
              placeholder="请输入文档标题"
              required
            />
          </UFormGroup>

          <FolderSelector
            v-if="!documentId"
            v-model="selectedParentId"
            label="保存位置"
          />

          <div class="flex justify-end gap-2">
            <UButton
              color="gray"
              variant="ghost"
              @click="isOpen = false"
            >
              取消
            </UButton>
            <UButton
              :loading="saving"
              @click="handleSave"
            >
              保存
            </UButton>
          </div>
        </div>
      </UCard>
    </UModal>
  </div>
</template>
