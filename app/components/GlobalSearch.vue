<script lang="ts" setup>
import { useSearch } from '~/composables/useSearch'
import { useSafeLocalePath } from '~/utils/safeLocalePath'

const { tm: $tm, t } = useI18n()
const editorData = computed(() => $tm('editor') as Record<string, string> | undefined)
const safeLocalePath = useSafeLocalePath()

const { query, results, isSearching, isOpen, closeSearch } = useSearch()

function navigateToDocument(id: string) {
  closeSearch()
  navigateTo(`${safeLocalePath('/documents')}/${id}`)
}

function highlightMatch(text: string, q: string): string {
  if (!q.trim()) return text
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="bg-warning/30 rounded px-0.5">$1</mark>')
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :ui="{ content: 'max-w-lg' }"
    :title="editorData?.searchPlaceholder || t('editor.searchPlaceholder')"
  >
    <template #body>
      <div class="space-y-3">
        <UInput
          v-model="query"
          :placeholder="editorData?.searchPlaceholder || t('editor.searchPlaceholder')"
          icon="i-lucide-search"
          autofocus
        >
          <template #trailing>
            <UIcon
              v-if="isSearching"
              name="i-lucide-loader-2"
              class="size-4 animate-spin text-dimmed"
            />
          </template>
        </UInput>

        <div
          v-if="results.length > 0"
          class="max-h-80 overflow-y-auto space-y-1"
        >
          <button
            v-for="result in results"
            :key="result.id"
            class="w-full text-left p-3 rounded-lg hover:bg-elevated transition-colors"
            @click="navigateToDocument(result.id)"
          >
            <div class="font-medium text-sm text-default">
              <span v-html="highlightMatch(result.title, query)" />
            </div>
            <div
              v-if="result.content_preview"
              class="text-xs text-dimmed mt-1 line-clamp-2"
            >
              <span v-html="highlightMatch(result.content_preview, query)" />
            </div>
          </button>
        </div>

        <div
          v-else-if="query.trim() && !isSearching"
          class="text-center text-sm text-dimmed py-6"
        >
          {{ editorData?.searchNoResults || t('editor.searchNoResults') }}
        </div>
      </div>
    </template>
  </UModal>
</template>
