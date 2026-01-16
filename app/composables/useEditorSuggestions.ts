import type { EditorSuggestionMenuItem, EditorCustomHandlers } from '@nuxt/ui'

export function useEditorSuggestions<T extends EditorCustomHandlers>(_customHandlers?: T) {
  const { tm: $tm } = useNuxtApp().$i18n
  const suggestionsData = computed(() => $tm('suggestions') as Record<string, string> | undefined)
  const toolbarData = computed(() => $tm('toolbar') as Record<string, string> | undefined)

  const items = computed(() => {
    const suggestions = suggestionsData.value
    const toolbar = toolbarData.value
    return [[{
      type: 'label',
      label: suggestions?.style
    }, {
      kind: 'paragraph',
      label: toolbar?.paragraph,
      icon: 'i-lucide-type'
    }, {
      kind: 'heading',
      level: 1,
      label: toolbar?.heading1,
      icon: 'i-lucide-heading-1'
    }, {
      kind: 'heading',
      level: 2,
      label: toolbar?.heading2,
      icon: 'i-lucide-heading-2'
    }, {
      kind: 'heading',
      level: 3,
      label: toolbar?.heading3,
      icon: 'i-lucide-heading-3'
    }, {
      kind: 'bulletList',
      label: toolbar?.bulletList,
      icon: 'i-lucide-list'
    }, {
      kind: 'orderedList',
      label: toolbar?.orderedList,
      icon: 'i-lucide-list-ordered'
    }, {
      kind: 'taskList',
      label: toolbar?.taskList,
      icon: 'i-lucide-list-check'
    }, {
      kind: 'blockquote',
      label: toolbar?.blockquote,
      icon: 'i-lucide-text-quote'
    }, {
      kind: 'codeBlock',
      label: toolbar?.codeBlock,
      icon: 'i-lucide-square-code'
    }], [{
      type: 'label',
      label: suggestions?.insert
    }, {
      kind: 'emoji',
      label: suggestions?.emoji,
      icon: 'i-lucide-smile-plus'
    }, {
      kind: 'imageUpload',
      label: toolbar?.image,
      icon: 'i-lucide-image'
    }, {
      kind: 'table',
      label: suggestions?.table,
      icon: 'i-lucide-table'
    }, {
      kind: 'horizontalRule',
      label: suggestions?.horizontalRule,
      icon: 'i-lucide-separator-horizontal'
    }]] as EditorSuggestionMenuItem<T>[][]
  })

  return {
    items
  }
}
