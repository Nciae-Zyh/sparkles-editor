<script lang="ts" setup>
import { useDocuments } from '~/composables/useDocuments'
import { useAuth } from '~/composables/useAuth'

interface Props {
  title: string
  content: string
  documentId?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  saved: [documentId: string]
}>()

const { saveDocument, loading } = useDocuments()
const { user } = useAuth()

const isOpen = ref(false)
const titleInput = ref(props.title)
const saving = ref(false)

watch(() => props.title, (newTitle) => {
  titleInput.value = newTitle
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
    const document = await saveDocument(titleInput.value.trim(), props.content, props.documentId)
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
