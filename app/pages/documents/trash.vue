<script lang="ts" setup>
import type { Document } from '~/types'
import { useSafeLocalePath } from '~/utils/safeLocalePath'
import { useDocuments } from '~/composables/useDocuments'

const { tm: $tm, t } = useI18n()

definePageMeta({
  layout: 'documents'
})

const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)
const actionsData = computed(() => $tm('actions') as Record<string, string> | undefined)
const safeLocalePath = useSafeLocalePath()

const {
  fetchTrash,
  restoreDocument,
  permanentDeleteDocument,
  emptyTrash
} = useDocuments()

const items = ref<Document[]>([])
const loading = ref(false)
const restoringId = ref<string | null>(null)
const deletingId = ref<string | null>(null)
const emptying = ref(false)

const loadTrash = async () => {
  loading.value = true
  try {
    items.value = await fetchTrash()
  } catch (error) {
    console.error('Failed to load trash:', error)
    alert(documentsData.value?.loadFailed || t('documents.loadFailed'))
  } finally {
    loading.value = false
  }
}

const handleRestore = async (id: string) => {
  try {
    restoringId.value = id
    await restoreDocument(id, null)
    await loadTrash()
  } catch (error) {
    console.error('Failed to restore:', error)
    alert(documentsData.value?.restoreFailed || t('documents.restoreFailed'))
  } finally {
    restoringId.value = null
  }
}

const handlePermanentDelete = async (id: string) => {
  if (!confirm(documentsData.value?.permanentDeleteConfirm || t('documents.permanentDeleteConfirm'))) {
    return
  }

  try {
    deletingId.value = id
    await permanentDeleteDocument(id)
    await loadTrash()
  } catch (error) {
    console.error('Failed to delete permanently:', error)
    alert(documentsData.value?.deleteFailed || t('documents.deleteFailed'))
  } finally {
    deletingId.value = null
  }
}

const handleEmptyTrash = async () => {
  if (!items.value.length) {
    return
  }

  if (!confirm(documentsData.value?.emptyTrashConfirm || t('documents.emptyTrashConfirm'))) {
    return
  }

  try {
    emptying.value = true
    await emptyTrash()
    items.value = []
  } catch (error) {
    console.error('Failed to empty trash:', error)
    alert(documentsData.value?.deleteFailed || t('documents.deleteFailed'))
  } finally {
    emptying.value = false
  }
}

onMounted(loadTrash)
</script>

<template>
  <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="flex items-center justify-between gap-4 mb-6">
      <div class="flex items-center gap-3">
        <UButton
          :to="safeLocalePath('/documents')"
          icon="i-lucide-arrow-left"
          size="sm"
          variant="ghost"
        >
          {{ documentsData?.back || t('documents.back') }}
        </UButton>
        <h1 class="text-2xl font-bold">
          {{ documentsData?.trash || t('documents.trash') }}
        </h1>
      </div>

      <UButton
        :disabled="items.length === 0"
        :loading="emptying"
        color="error"
        icon="i-lucide-trash-2"
        size="sm"
        variant="soft"
        @click="handleEmptyTrash"
      >
        {{ documentsData?.emptyTrash || t('documents.emptyTrash') }}
      </UButton>
    </div>

    <div
      v-if="loading"
      class="flex justify-center py-16"
    >
      <UIcon
        name="i-lucide-loader-2"
        class="w-6 h-6 animate-spin"
      />
    </div>

    <div
      v-else-if="items.length === 0"
      class="border border-default rounded-lg bg-default py-16 text-center text-muted"
    >
      {{ documentsData?.trashEmpty || t('documents.trashEmpty') }}
    </div>

    <div
      v-else
      class="border border-default rounded-lg divide-y divide-default"
    >
      <div
        v-for="item in items"
        :key="item.id"
        class="p-4 flex items-center justify-between gap-4"
      >
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <UIcon :name="item.type === 'folder' ? 'i-lucide-folder' : 'i-lucide-file-text'" />
            <span class="font-medium truncate">
              {{ item.title || (documentsData?.untitledDocument || t('documents.untitledDocument')) }}
            </span>
          </div>
          <p class="text-xs text-muted mt-1">
            {{ new Date((item.deleted_at || item.updated_at || 0) * 1000).toLocaleString() }}
          </p>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <UButton
            :loading="restoringId === item.id"
            color="primary"
            icon="i-lucide-rotate-ccw"
            size="xs"
            variant="soft"
            @click="handleRestore(item.id)"
          >
            {{ documentsData?.restore || t('documents.restore') }}
          </UButton>
          <UButton
            :loading="deletingId === item.id"
            color="error"
            icon="i-lucide-trash-2"
            size="xs"
            variant="soft"
            @click="handlePermanentDelete(item.id)"
          >
            {{ actionsData?.delete || t('actions.delete') }}
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>
