<script lang="ts" setup>
import { useSafeLocalePath } from '~/utils/safeLocalePath'

definePageMeta({
  layout: 'documents'
})

const { tm: $tm, t } = useI18n()
const safeLocalePath = useSafeLocalePath()
const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)

interface StatsData {
  totalDocuments: number
  totalFolders: number
  totalChars: number
  activeLast7Days: number
  topEditedDocuments: Array<{ id: string, title: string, updated_at: number, created_at: number }>
  recentlyCreatedDocuments: Array<{ id: string, title: string, created_at: number }>
}

const stats = ref<StatsData | null>(null)
const loading = ref(true)

async function fetchStats() {
  try {
    loading.value = true
    stats.value = await $fetch<StatsData>('/api/documents/stats')
  } catch (e) {
    console.error('Failed to fetch stats:', e)
  } finally {
    loading.value = false
  }
}

function formatDate(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function formatNumber(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

onMounted(fetchStats)
</script>

<template>
  <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="flex items-center gap-4 mb-8">
      <UButton
        :to="safeLocalePath('/documents')"
        icon="i-lucide-arrow-left"
        size="sm"
        variant="ghost"
      >
        {{ documentsData?.back || t('documents.back') }}
      </UButton>
      <h1 class="text-2xl font-bold">
        {{ documentsData?.stats?.title || 'Document Statistics' }}
      </h1>
    </div>

    <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      <USkeleton v-for="i in 4" :key="i" class="h-28 rounded-xl" />
    </div>

    <template v-else-if="stats">
      <!-- Stats Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <UCard>
          <div class="flex items-center gap-4">
            <div class="rounded-lg bg-primary/10 p-3">
              <UIcon name="i-lucide-file-text" class="size-6 text-primary" />
            </div>
            <div>
              <p class="text-2xl font-bold">{{ formatNumber(stats.totalDocuments) }}</p>
              <p class="text-sm text-muted">
                {{ documentsData?.stats?.totalDocuments || 'Total Documents' }}
              </p>
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center gap-4">
            <div class="rounded-lg bg-success/10 p-3">
              <UIcon name="i-lucide-type" class="size-6 text-success" />
            </div>
            <div>
              <p class="text-2xl font-bold">{{ formatNumber(stats.totalChars) }}</p>
              <p class="text-sm text-muted">
                {{ documentsData?.stats?.totalChars || 'Total Characters' }}
              </p>
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center gap-4">
            <div class="rounded-lg bg-warning/10 p-3">
              <UIcon name="i-lucide-zap" class="size-6 text-warning" />
            </div>
            <div>
              <p class="text-2xl font-bold">{{ stats.activeLast7Days }}</p>
              <p class="text-sm text-muted">
                {{ documentsData?.stats?.activeLast7Days || 'Active (7 days)' }}
              </p>
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center gap-4">
            <div class="rounded-lg bg-info/10 p-3">
              <UIcon name="i-lucide-folder" class="size-6 text-info" />
            </div>
            <div>
              <p class="text-2xl font-bold">{{ stats.totalFolders }}</p>
              <p class="text-sm text-muted">
                {{ documentsData?.stats?.totalFolders || 'Total Folders' }}
              </p>
            </div>
          </div>
        </UCard>
      </div>

      <!-- Top edited & Recently created -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-trending-up" class="size-4" />
              <h3 class="font-semibold">
                {{ documentsData?.stats?.recentlyEdited || 'Recently Edited' }}
              </h3>
            </div>
          </template>
          <div v-if="stats.topEditedDocuments.length === 0" class="text-sm text-muted py-4 text-center">
            {{ documentsData?.stats?.noDocuments || 'No documents yet' }}
          </div>
          <div v-else class="space-y-3">
            <NuxtLink
              v-for="doc in stats.topEditedDocuments"
              :key="doc.id"
              :to="`${safeLocalePath('/documents')}/${doc.id}`"
              class="flex items-center justify-between p-2 rounded-lg hover:bg-elevated transition-colors"
            >
              <div class="flex items-center gap-2 min-w-0">
                <UIcon name="i-lucide-file-text" class="size-4 text-primary shrink-0" />
                <span class="truncate">{{ doc.title || 'Untitled' }}</span>
              </div>
              <span class="text-xs text-muted shrink-0 ml-2">{{ formatDate(doc.updated_at) }}</span>
            </NuxtLink>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-clock" class="size-4" />
              <h3 class="font-semibold">
                {{ documentsData?.stats?.recentlyCreated || 'Recently Created' }}
              </h3>
            </div>
          </template>
          <div v-if="stats.recentlyCreatedDocuments.length === 0" class="text-sm text-muted py-4 text-center">
            {{ documentsData?.stats?.noDocuments || 'No documents yet' }}
          </div>
          <div v-else class="space-y-3">
            <NuxtLink
              v-for="doc in stats.recentlyCreatedDocuments"
              :key="doc.id"
              :to="`${safeLocalePath('/documents')}/${doc.id}`"
              class="flex items-center justify-between p-2 rounded-lg hover:bg-elevated transition-colors"
            >
              <div class="flex items-center gap-2 min-w-0">
                <UIcon name="i-lucide-file-plus" class="size-4 text-success shrink-0" />
                <span class="truncate">{{ doc.title || 'Untitled' }}</span>
              </div>
              <span class="text-xs text-muted shrink-0 ml-2">{{ formatDate(doc.created_at) }}</span>
            </NuxtLink>
          </div>
        </UCard>
      </div>
    </template>
  </div>
</template>
