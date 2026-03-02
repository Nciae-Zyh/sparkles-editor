<script lang="ts" setup>
import { useSafeLocalePath } from '~/utils/safeLocalePath'

const { tm: $tm, t } = useI18n()

definePageMeta({
  layout: 'documents'
})

const route = useRoute()
const safeLocalePath = useSafeLocalePath()
const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)

const currentFolderId = computed(() => route.query.folder as string | undefined)
</script>

<template>
  <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="flex items-center justify-between gap-4 mb-6">
      <div class="flex items-center gap-4">
        <UButton
          v-if="currentFolderId"
          icon="i-lucide-arrow-left"
          size="sm"
          variant="ghost"
          @click="navigateTo(safeLocalePath('/documents'))"
        >
          {{ documentsData?.back || t('documents.back') }}
        </UButton>
        <h1 class="text-2xl font-bold">
          {{ documentsData?.myDocuments || t('documents.myDocuments') }}
        </h1>
      </div>
      <UButton
        :to="safeLocalePath('/documents/trash')"
        icon="i-lucide-trash-2"
        size="sm"
        variant="soft"
        color="warning"
      >
        {{ documentsData?.trash || t('documents.trash') }}
      </UButton>
    </div>
    <DocumentsDocumentTreeWithDragDrop />
  </div>
</template>
