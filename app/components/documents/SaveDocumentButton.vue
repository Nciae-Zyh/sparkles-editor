<script lang="ts" setup>
import { useDocuments } from '~/composables/useDocuments'
import { useAuth } from '~/composables/useAuth'

const { tm: $tm, t } = useI18n()

interface Props {
  title: string
  content: string
  documentId?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  saved: [documentId: string, title: string]
}>()

const { saveDocument, loading } = useDocuments()
const { user } = useAuth()

const actionsData = computed(() => $tm('actions') as Record<string, string> | undefined)

const isOpen = ref(false)
const pathInput = ref(props.title)
const saving = ref(false)

const getErrorMessage = (error: unknown) => {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') {
      return message
    }
  }
  return ''
}

watch(() => props.title, (newTitle) => {
  pathInput.value = newTitle
})

const handleSave = async () => {
  if (!user.value) {
    alert(actionsData.value?.pleaseLogin || t('actions.pleaseLogin'))
    return
  }

  if (!pathInput.value.trim()) {
    alert(actionsData.value?.pleaseEnterPath || t('actions.pleaseEnterPath'))
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
    // 传递文档ID和用户设置的标题（pathInput.value，这是用户手动输入的标题）
    emit('saved', document.id, pathInput.value.trim())
    isOpen.value = false
  } catch (error: unknown) {
    console.error('[SaveDocumentButton] 保存文档失败:', {
      message: getErrorMessage(error),
      error
    })
    alert(getErrorMessage(error) || actionsData.value?.saveFailed || t('actions.saveFailed'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <UTooltip
      v-if="(actionsData?.saveDocument || t('actions.saveDocument')).length > 10"
      :text="actionsData?.saveDocument || t('actions.saveDocument')"
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
      {{ actionsData?.saveDocument || t('actions.saveDocument') }}
    </UButton>

    <UModal
      v-model:open="isOpen"
      :title="documentId ? (actionsData?.updateDocument || t('actions.updateDocument')) : (actionsData?.saveDocument || t('actions.saveDocument'))"
      :ui="{ footer: 'justify-end' }"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            :label="actionsData?.storagePath || t('actions.storagePath')"
            name="path"
            required
          >
            <UInput
              v-model="pathInput"
              :placeholder="actionsData?.pathPlaceholder || t('actions.pathPlaceholder')"
              required
            />
            <template #description>
              <div class="text-xs text-muted mt-1">
                {{ actionsData?.pathDescription || t('actions.pathDescription') }}
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
          {{ actionsData?.cancel || t('actions.cancel') }}
        </UButton>
        <UButton
          :loading="saving"
          @click="handleSave"
        >
          {{ actionsData?.save || t('actions.save') }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
