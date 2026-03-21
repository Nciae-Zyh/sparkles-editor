<script lang="ts" setup>
interface Props {
  documentId: string
}

interface Version {
  id: string
  title: string
  content_length: number
  created_at: string
}

const props = defineProps<Props>()
const { tm: $tm, t } = useI18n()
const editorData = computed(() => $tm('editor') as Record<string, string> | undefined)
const toast = useToast()

const open = defineModel<boolean>('open', { default: false })
const versions = ref<Version[]>([])
const loading = ref(false)
const selectedVersion = ref<Version | null>(null)
const previewContent = ref<string | null>(null)
const previewLoading = ref(false)
const restoring = ref(false)

async function fetchVersions() {
  if (!props.documentId) return
  try {
    loading.value = true
    const data = await $fetch<{ versions: Version[] }>(`/api/documents/${props.documentId}/versions`)
    versions.value = data.versions || []
  } catch (e) {
    console.error('Failed to fetch versions:', e)
  } finally {
    loading.value = false
  }
}

async function previewVersion(version: Version) {
  selectedVersion.value = version
  try {
    previewLoading.value = true
    const data = await $fetch<{ content: string }>(`/api/documents/${props.documentId}/versions/${version.id}`)
    previewContent.value = data.content || ''
  } catch (e) {
    console.error('Failed to preview version:', e)
    previewContent.value = null
  } finally {
    previewLoading.value = false
  }
}

async function restoreVersion(version: Version) {
  try {
    restoring.value = true
    await $fetch(`/api/documents/${props.documentId}/versions/${version.id}/restore`, { method: 'POST' })
    toast.add({
      title: editorData.value?.versionRestored || 'Version restored',
      color: 'success',
      icon: 'i-lucide-check-circle-2'
    })
    open.value = false
    // 触发页面刷新
    await navigateTo(`/documents/${props.documentId}`, { replace: true })
  } catch (e) {
    toast.add({
      title: editorData.value?.versionRestoreFailed || 'Restore failed',
      color: 'error',
      icon: 'i-lucide-x-circle'
    })
  } finally {
    restoring.value = false
  }
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 86_400_000) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  if (diff < 604_800_000) {
    const days = Math.floor(diff / 86_400_000)
    return `${days}d ago`
  }
  return d.toLocaleDateString()
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

watch(open, (val) => {
  if (val) fetchVersions()
})
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="editorData?.versionHistory || 'Version History'"
    :ui="{ content: 'max-w-md' }"
  >
    <template #body>
      <div v-if="loading" class="space-y-3">
        <USkeleton v-for="i in 5" :key="i" class="h-14 w-full rounded-lg" />
      </div>

      <div v-else-if="versions.length === 0" class="text-center text-dimmed py-10">
        <UIcon name="i-lucide-history" class="size-10 mx-auto mb-3 opacity-40" />
        <p class="text-sm">{{ editorData?.noVersions || 'No version history yet' }}</p>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="version in versions"
          :key="version.id"
          class="group p-3 rounded-lg border border-default hover:bg-elevated transition-colors cursor-pointer"
          :class="{ 'border-primary bg-primary/5': selectedVersion?.id === version.id }"
          @click="previewVersion(version)"
        >
          <div class="flex items-center justify-between">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-default truncate">{{ version.title || 'Untitled' }}</p>
              <div class="flex items-center gap-2 mt-0.5 text-xs text-dimmed">
                <span>{{ formatDate(version.created_at) }}</span>
                <span>·</span>
                <span>{{ formatSize(version.content_length) }}</span>
              </div>
            </div>
            <UButton
              size="xs"
              variant="ghost"
              color="primary"
              :loading="restoring && selectedVersion?.id === version.id"
              class="opacity-0 group-hover:opacity-100 transition-opacity"
              @click.stop="restoreVersion(version)"
            >
              <UIcon name="i-lucide-rotate-ccw" class="size-3.5" />
              {{ editorData?.restore || 'Restore' }}
            </UButton>
          </div>
        </div>
      </div>

      <!-- Preview panel -->
      <div v-if="selectedVersion && previewContent !== null" class="mt-4 pt-4 border-t border-default">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-sm font-medium text-default">{{ editorData?.preview || 'Preview' }}</h4>
          <UButton
            size="xs"
            variant="soft"
            color="primary"
            :loading="restoring"
            @click="restoreVersion(selectedVersion)"
          >
            <UIcon name="i-lucide-rotate-ccw" class="size-3.5 mr-1" />
            {{ editorData?.restoreThisVersion || 'Restore this version' }}
          </UButton>
        </div>
        <div v-if="previewLoading" class="space-y-2">
          <USkeleton v-for="i in 3" :key="i" class="h-4 w-full" />
        </div>
        <div
          v-else
          class="max-h-60 overflow-y-auto text-sm text-muted prose prose-sm dark:prose-invert"
          v-html="previewContent"
        />
      </div>
    </template>
  </USlideover>
</template>
