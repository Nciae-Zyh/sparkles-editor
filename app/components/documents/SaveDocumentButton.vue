<script lang="ts" setup>
import { useDocuments } from '~/composables/useDocuments'
import { useAuth } from '~/composables/useAuth'
import type { Document } from '~/types'

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

const actionsData = computed(() => $tm('actions') as Record<string, string> | undefined)

const isOpen = ref(false)
const pathInput = ref(props.title)
const saving = ref(false)

watch(() => props.title, (newTitle) => {
  pathInput.value = newTitle
})

const handleSave = async () => {
  if (!user.value) {
    alert(actionsData.value?.pleaseLogin || '请先登录')
    return
  }

  if (!pathInput.value.trim()) {
    alert(actionsData.value?.pleaseEnterPath || '请输入存储路径')
    return
  }

  try {
    saving.value = true
    console.log('[SaveDocumentButton] 开始保存文档:', {
      documentId: props.documentId,
      path: pathInput.value.trim(),
      contentLength: props.content?.length || 0
    })

    const document = await saveDocument(
      pathInput.value.trim(),
      props.content,
      props.documentId
    )

    console.log('[SaveDocumentButton] 文档保存成功:', document.id)
    emit('saved', document.id)
    isOpen.value = false
  } catch (error: any) {
    console.error('[SaveDocumentButton] 保存文档失败:', {
      message: error?.message,
      error: error
    })
    alert(error.message || actionsData.value?.saveFailed || '保存失败，请稍后重试')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <UTooltip
      v-if="(actionsData?.saveDocument || '保存文档').length > 10"
      :text="actionsData?.saveDocument || '保存文档'"
    >
      <UButton
        :loading="loading"
        icon="i-lucide-save"
        @click="isOpen = true"
      />
    </UTooltip>
    <UButton
      v-else
      :loading="loading"
      icon="i-lucide-save"
      @click="isOpen = true"
    >
      {{ actionsData?.saveDocument || '保存文档' }}
    </UButton>

    <UModal
      v-model:open="isOpen"
      :title="documentId ? (actionsData?.updateDocument || '更新文档') : (actionsData?.saveDocument || '保存文档')"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            :label="actionsData?.storagePath || '存储路径'"
            name="path"
            required
          >
            <UInput
              v-model="pathInput"
              :placeholder="actionsData?.pathPlaceholder || '例如: folder/subfolder/file.md'"
              required
            />
            <template #description>
              <div class="text-xs text-gray-500 mt-1">
                {{ actionsData?.pathDescription || '输入文件路径，系统会自动创建文件夹结构。例如: project/docs/readme.md' }}
              </div>
            </template>
          </UFormField>
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
          :loading="saving"
          @click="handleSave"
        >
          {{ actionsData?.save || '保存' }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
