<script lang="ts" setup>
import { useSafeLocalePath } from '~/utils/safeLocalePath'

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
    <div class="flex items-center gap-4 mb-6">
      <UButton
        v-if="currentFolderId"
        icon="i-lucide-arrow-left"
        size="sm"
        variant="ghost"
        @click="navigateTo(safeLocalePath('/documents'), {
          query: { function: 'create' }
        })"
      >
        {{ documentsData?.back || '返回' }}
      </UButton>
      <h1 class="text-2xl font-bold">
        {{ documentsData?.myDocuments || '我的文档' }}
      </h1>
    </div>
    <DocumentsDocumentTree />
  </div>
</template>
