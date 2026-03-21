<script lang="ts" setup>
import { useSafeLocalePath } from '~/utils/safeLocalePath'

definePageMeta({
  layout: 'documents'
})

const { tm: $tm, t } = useI18n()
const safeLocalePath = useSafeLocalePath()
const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)
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
        {{ documentsData?.activity?.pageTitle || 'Recent Activity' }}
      </h1>
    </div>

    <div class="max-w-2xl">
      <DocumentsActivityFeed />
    </div>
  </div>
</template>
