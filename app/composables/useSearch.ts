import { useDebounceFn } from '@vueuse/core'

export interface SearchResult {
  id: string
  title: string
  content_preview: string
  updated_at: number
}

export function useSearch() {
  const query = ref('')
  const results = ref<SearchResult[]>([])
  const isSearching = ref(false)
  const isOpen = ref(false)

  const search = useDebounceFn(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      results.value = []
      return
    }
    try {
      isSearching.value = true
      const data = await $fetch<SearchResult[]>('/api/documents/search', {
        params: { q: searchQuery, limit: 10 }
      })
      results.value = data || []
    } catch (error) {
      console.error('Search failed:', error)
      results.value = []
    } finally {
      isSearching.value = false
    }
  }, 300)

  function openSearch() {
    isOpen.value = true
  }

  function closeSearch() {
    isOpen.value = false
    query.value = ''
    results.value = []
  }

  watch(query, (val) => {
    search(val)
  })

  // 全局快捷键 Cmd/Ctrl+K
  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      if (isOpen.value) {
        closeSearch()
      } else {
        openSearch()
      }
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown)
  })

  return {
    query,
    results,
    isSearching,
    isOpen,
    openSearch,
    closeSearch,
    search
  }
}
