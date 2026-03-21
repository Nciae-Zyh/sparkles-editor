<script lang="ts" setup>
import { useSafeLocalePath } from '~/utils/safeLocalePath'

interface BreadcrumbItem {
  id: string | null
  title: string
}

interface Props {
  documentId?: string
  folderId?: string
  documentTitle?: string
}

const props = defineProps<Props>()
const { tm: $tm, t } = useI18n()
const safeLocalePath = useSafeLocalePath()
const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)

const breadcrumbs = ref<BreadcrumbItem[]>([])
const loading = ref(false)

async function fetchPath() {
  const targetId = props.documentId || props.folderId
  if (!targetId) {
    breadcrumbs.value = [{ id: null, title: documentsData.value?.myDocuments || t('documents.myDocuments') }]
    return
  }

  try {
    loading.value = true
    const data = await $fetch<{ path: Array<{ id: string, title: string }> }>(`/api/documents/${targetId}/path`)

    // Build breadcrumbs: root > folder1 > folder2 > current
    const items: BreadcrumbItem[] = [
      { id: null, title: documentsData.value?.myDocuments || t('documents.myDocuments') }
    ]

    for (const p of data.path || []) {
      items.push({ id: p.id, title: p.title })
    }

    // If this is a document (not folder), add the document title as the last item
    if (props.documentId && props.documentTitle) {
      items.push({ id: props.documentId, title: props.documentTitle })
    }

    breadcrumbs.value = items
  } catch (e) {
    console.error('Failed to fetch path:', e)
    breadcrumbs.value = [{ id: null, title: documentsData.value?.myDocuments || t('documents.myDocuments') }]
  } finally {
    loading.value = false
  }
}

function getItemUrl(item: BreadcrumbItem): string {
  if (!item.id) {
    return safeLocalePath('/documents')
  }
  return `${safeLocalePath('/documents')}?folder=${item.id}`
}

function handleClick(item: BreadcrumbItem, index: number) {
  // Don't navigate if clicking the last item (current doc/folder)
  if (index === breadcrumbs.value.length - 1) return
  if (!item.id) {
    navigateTo(safeLocalePath('/documents'))
  } else {
    navigateTo(`${safeLocalePath('/documents')}?folder=${item.id}`)
  }
}

watch(() => [props.documentId, props.folderId], () => {
  fetchPath()
}, { immediate: true })
</script>

<template>
  <nav
    v-if="breadcrumbs.length > 0"
    class="flex items-center gap-1 text-sm text-muted overflow-x-auto"
  >
    <template
      v-for="(item, index) in breadcrumbs"
      :key="item.id || 'root'"
    >
      <UIcon
        v-if="index > 0"
        name="i-lucide-chevron-right"
        class="size-3.5 shrink-0"
      />
      <button
        class="shrink-0 hover:text-default transition-colors truncate max-w-[200px]"
        :class="{
          'text-default font-medium cursor-default': index === breadcrumbs.length - 1,
          'cursor-pointer': index < breadcrumbs.length - 1
        }"
        @click="handleClick(item, index)"
      >
        <template v-if="loading && index === breadcrumbs.length - 1">
          <USkeleton class="h-4 w-20 inline-block" />
        </template>
        <template v-else>
          {{ item.title }}
        </template>
      </button>
    </template>
  </nav>
</template>
