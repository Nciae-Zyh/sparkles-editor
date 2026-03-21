<script lang="ts" setup>
import { useSafeLocalePath } from '~/utils/safeLocalePath'

const { tm: $tm, t } = useI18n()
const safeLocalePath = useSafeLocalePath()
const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)

interface ActivityItem {
  id: string
  title: string
  type: 'document' | 'folder'
  created_at: number
  updated_at: number
  _activityType: 'created' | 'edited'
}

const activities = ref<ActivityItem[]>([])
const loading = ref(true)

async function fetchActivities() {
  try {
    loading.value = true
    // Fetch recent and all documents to build activity timeline
    const recentData = await $fetch<{ items: Array<{ id: string, title: string, type: string, created_at: number, updated_at: number }> }>('/api/documents/recent')
    const items = (recentData.items || []).map(item => ({
      ...item,
      type: item.type as 'document' | 'folder',
      _activityType: (item.created_at === item.updated_at ? 'created' : 'edited') as 'created' | 'edited'
    }))

    // Sort by updated_at descending
    items.sort((a, b) => b.updated_at - a.updated_at)
    activities.value = items
  } catch (e) {
    console.error('Failed to fetch activities:', e)
  } finally {
    loading.value = false
  }
}

function formatRelativeTime(timestamp: number) {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - timestamp
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(timestamp * 1000).toLocaleDateString()
}

function getActivityIcon(item: ActivityItem) {
  if (item._activityType === 'created') return 'i-lucide-plus-circle'
  return 'i-lucide-pencil'
}

function getActivityColor(item: ActivityItem) {
  if (item._activityType === 'created') return 'text-success'
  return 'text-primary'
}

function getActivityLabel(item: ActivityItem) {
  if (item._activityType === 'created') {
    return item.type === 'folder'
      ? (documentsData.value?.activity?.folderCreated || 'Folder created')
      : (documentsData.value?.activity?.documentCreated || 'Document created')
  }
  return documentsData.value?.activity?.documentEdited || 'Document edited'
}

onMounted(fetchActivities)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold flex items-center gap-2">
        <UIcon name="i-lucide-activity" class="size-5" />
        {{ documentsData?.activity?.title || 'Activity' }}
      </h3>
      <UButton
        size="xs"
        variant="ghost"
        icon="i-lucide-refresh-cw"
        @click="fetchActivities"
      >
        {{ documentsData?.activity?.refresh || 'Refresh' }}
      </UButton>
    </div>

    <div v-if="loading" class="space-y-3">
      <USkeleton v-for="i in 5" :key="i" class="h-14 w-full rounded-lg" />
    </div>

    <div v-else-if="activities.length === 0" class="text-center text-dimmed py-10">
      <UIcon name="i-lucide-clock" class="size-10 mx-auto mb-3 opacity-40" />
      <p class="text-sm">{{ documentsData?.activity?.noActivity || 'No recent activity' }}</p>
    </div>

    <div v-else class="relative">
      <!-- Timeline line -->
      <div class="absolute left-4 top-0 bottom-0 w-px bg-default" />

      <div class="space-y-1">
        <NuxtLink
          v-for="item in activities"
          :key="item.id"
          :to="`${safeLocalePath('/documents')}/${item.id}`"
          class="relative flex items-start gap-4 p-3 rounded-lg hover:bg-elevated transition-colors"
        >
          <!-- Timeline dot -->
          <div class="relative z-10 flex items-center justify-center w-8 h-8 rounded-full bg-default border-2 border-default">
            <UIcon
              :name="getActivityIcon(item)"
              :class="['size-4', getActivityColor(item)]"
            />
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <UIcon
                :name="item.type === 'folder' ? 'i-lucide-folder' : 'i-lucide-file-text'"
                class="size-3.5 shrink-0"
              />
              <span class="font-medium truncate">{{ item.title || 'Untitled' }}</span>
            </div>
            <div class="flex items-center gap-2 mt-0.5 text-xs text-dimmed">
              <span>{{ getActivityLabel(item) }}</span>
              <span>·</span>
              <span>{{ formatRelativeTime(item.updated_at) }}</span>
            </div>
          </div>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
