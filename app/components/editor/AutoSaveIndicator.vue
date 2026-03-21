<script lang="ts" setup">
interface Props {
  hasUnsavedChanges: boolean
  isSaving: boolean
  lastSavedAt: number | null
}

const props = defineProps<Props>()
const { tm: $tm, t } = useI18n()
const editorData = computed(() => $tm('editor') as Record<string, string> | undefined)

const formattedTime = computed(() => {
  if (!props.lastSavedAt) return ''
  const now = Date.now()
  const diff = now - props.lastSavedAt
  if (diff < 60_000) return editorData.value?.savedJustNow || t('editor.savedJustNow')
  if (diff < 3_600_000) {
    const mins = Math.floor(diff / 60_000)
    return `${mins} ${editorData.value?.savedMinutesAgo || t('editor.savedMinutesAgo')}`
  }
  return new Date(props.lastSavedAt).toLocaleTimeString()
})
</script>

<template>
  <div class="flex items-center gap-1.5 text-xs text-dimmed select-none">
    <!-- Saving -->
    <template v-if="isSaving">
      <UIcon
        name="i-lucide-loader-2"
        class="size-3 animate-spin text-warning"
      />
      <span class="text-warning">{{ editorData?.saving || t('editor.saving') }}</span>
    </template>
    <!-- Unsaved -->
    <template v-else-if="hasUnsavedChanges">
      <UIcon
        name="i-lucide-circle"
        class="size-2 text-warning"
      />
      <span class="text-warning">{{ editorData?.unsaved || t('editor.unsaved') }}</span>
    </template>
    <!-- Saved -->
    <template v-else-if="lastSavedAt">
      <UIcon
        name="i-lucide-check-circle-2"
        class="size-3 text-success"
      />
      <span class="text-success">{{ editorData?.saved || t('editor.saved') }}</span>
      <span
        v-if="formattedTime"
        class="text-dimmed"
      > · {{ formattedTime }}</span>
    </template>
  </div>
</template>
