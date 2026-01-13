import type { EditorToolbarItem, EditorCustomHandlers } from '@nuxt/ui'
import type { Editor } from '@tiptap/vue-3'

export function useEditorToolbar<T extends EditorCustomHandlers>(_customHandlers?: T) {
  const { tm: $tm } = useNuxtApp().$i18n
  const toolbarData = computed(() => $tm('toolbar') as Record<string, string> | undefined)

  const toolbarItems = computed(() => {
    const toolbar = toolbarData.value
    return [[{
      kind: 'undo',
      icon: 'i-lucide-undo',
      tooltip: { text: toolbar?.undo }
    }, {
      kind: 'redo',
      icon: 'i-lucide-redo',
      tooltip: { text: toolbar?.redo }
    }], [{
      kind: 'imageUpload',
      label: toolbar?.add,
      icon: 'i-lucide-image',
      tooltip: { text: toolbar?.addImage }
    }]] satisfies EditorToolbarItem<T>[][]
  })

  const bubbleToolbarItems = computed(() => {
    const toolbar = toolbarData.value
    return [[{
      label: toolbar?.turnInto,
      trailingIcon: 'i-lucide-chevron-down',
      activeColor: 'neutral',
      activeVariant: 'ghost',
      tooltip: { text: toolbar?.turnInto },
      content: {
        align: 'start'
      },
      ui: {
        label: 'text-xs'
      },
      items: [{
        type: 'label',
        label: toolbar?.turnInto
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
        kind: 'heading',
        level: 4,
        label: toolbar?.heading4,
        icon: 'i-lucide-heading-4'
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
      }]
    }], [{
      kind: 'mark',
      mark: 'bold',
      icon: 'i-lucide-bold',
      tooltip: { text: toolbar?.bold }
    }, {
      kind: 'mark',
      mark: 'italic',
      icon: 'i-lucide-italic',
      tooltip: { text: toolbar?.italic }
    }, {
      kind: 'mark',
      mark: 'underline',
      icon: 'i-lucide-underline',
      tooltip: { text: toolbar?.underline }
    }, {
      kind: 'mark',
      mark: 'strike',
      icon: 'i-lucide-strikethrough',
      tooltip: { text: toolbar?.strikethrough }
    }, {
      kind: 'mark',
      mark: 'code',
      icon: 'i-lucide-code',
      tooltip: { text: toolbar?.code }
    }], [{
      slot: 'link' as const,
      icon: 'i-lucide-link'
    }, {
      kind: 'imageUpload',
      icon: 'i-lucide-image',
      tooltip: { text: toolbar?.image }
    }]] satisfies EditorToolbarItem<T>[][]
  })

  const getImageToolbarItems = (editor: Editor): EditorToolbarItem<T>[][] => {
    const toolbar = toolbarData.value
    const node = editor.state.doc.nodeAt(editor.state.selection.from)

    return [[{
      icon: 'i-lucide-download',
      to: node?.attrs?.src,
      download: true,
      tooltip: { text: toolbar?.download }
    }, {
      icon: 'i-lucide-refresh-cw',
      tooltip: { text: toolbar?.replace },
      onClick: () => {
        const { state } = editor
        const { selection } = state

        const pos = selection.from
        const node = state.doc.nodeAt(pos)

        if (node && node.type.name === 'image') {
          editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).insertContentAt(pos, { type: 'imageUpload' }).run()
        }
      }
    }], [{
      slot: 'imageAlt' as const,
      icon: 'i-lucide-file-text',
      tooltip: { text: toolbar?.editAltText }
    }], [{
      icon: 'i-lucide-trash',
      tooltip: { text: toolbar?.delete },
      onClick: () => {
        const { state } = editor
        const { selection } = state

        const pos = selection.from
        const node = state.doc.nodeAt(pos)

        if (node && node.type.name === 'image') {
          editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run()
        }
      }
    }]]
  }

  const getTableToolbarItems = (editor: Editor): EditorToolbarItem<T>[][] => {
    const toolbar = toolbarData.value
    return [[{
      icon: 'i-lucide-between-vertical-start',
      tooltip: { text: toolbar?.addRowAbove },
      onClick: () => {
        editor.chain().focus().addRowBefore().run()
      }
    }, {
      icon: 'i-lucide-between-vertical-end',
      tooltip: { text: toolbar?.addRowBelow },
      onClick: () => {
        editor.chain().focus().addRowAfter().run()
      }
    }, {
      icon: 'i-lucide-between-horizontal-start',
      tooltip: { text: toolbar?.addColumnBefore },
      onClick: () => {
        editor.chain().focus().addColumnBefore().run()
      }
    }, {
      icon: 'i-lucide-between-horizontal-end',
      tooltip: { text: toolbar?.addColumnAfter },
      onClick: () => {
        editor.chain().focus().addColumnAfter().run()
      }
    }], [{
      icon: 'i-lucide-rows-3',
      tooltip: { text: toolbar?.deleteRow },
      onClick: () => {
        editor.chain().focus().deleteRow().run()
      }
    }, {
      icon: 'i-lucide-columns-3',
      tooltip: { text: toolbar?.deleteColumn },
      onClick: () => {
        editor.chain().focus().deleteColumn().run()
      }
    }], [{
      icon: 'i-lucide-trash',
      tooltip: { text: toolbar?.deleteTable },
      onClick: () => {
        editor.chain().focus().deleteTable().run()
      }
    }]]
  }

  return {
    toolbarItems,
    bubbleToolbarItems,
    getImageToolbarItems,
    getTableToolbarItems
  }
}
