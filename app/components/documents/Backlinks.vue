<script lang="ts" setup>
import { useSafeLocalePath } from '~/utils/safeLocalePath'

interface Props {
  documentId: string
}

const props = defineProps<Props>()
const { tm: $tm, t } = useI18n()
const safeLocalePath = useSafeLocalePath()
const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)

interface Backlink {
  id: string
  title: string
  updated_at: number
  snippet: string
}

const backlinks = ref<Backlink[]>([])
const loading = ref(false)

async function fetchBacklinks() {
  if (!props.documentId) return
  try {
    loading.value = true
    const data = await $fetch<{ backlinks: Backlink[] }>(`/api/documents/${props.documentId}/backlinks`)
    backlinks.value = data.backlinks || []
  } catch (e) {
    console.error('Failed to fetch backlinks:', e)
  } finally {
    loading.value = false
  }
}

function formatDate(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })
}

watch(() => props.documentId, () => {
  fetchBacklinks()
}, { immediate: true })
</script>

<template>
  <div
    v-if="backlinks.length > 0 || loading"
    class="border-t border-default mt-8 pt-6"
  >
    <h3 class="text-sm font-semibold text-muted mb-3 flex items-center gap-2">
      <UIcon name="i-lucide-link-2" class="size-4" />
      {{ documentsData?.backlinks?.title || 'Backlinks' }}
      <span
        v-if="backlinks.length > 0"
        class="text-xs bg-elevated rounded-full px-2 py-0.5"
      >{{ backlinks.length }}</span>
    </h3>

    <div v-if="loading" class="space-y-2">
      <USkeleton v-for="i in 2" :key="i" class="h-16 w-full rounded-lg" />
    </div>

    <div v-else class="space-y-2">
      <NuxtLink
        v-for="link in backlinks"
        :key="link.id"
        :to="`${safeLocalePath('/documents')}/${link.id}`"
        class="block p-3 rounded-lg border border-default hover:bg-elevated transition-colors"
      >
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-file-text" class="size-3.5 text-primary" />
            <span class="text-sm font-medium">{{ link.title || 'Untitled' }}</span>
          </div>
          <span class="text-xs text-dimmed">{{ formatDate(link.updated_at) }}</span>
        </div>
        <p class="text-xs text-dimmed line-clamp-2">{{ link.snippet }}</p>
      </NuxtLink>
    </div>
  </div>
</template>
