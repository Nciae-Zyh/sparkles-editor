import { upperFirst } from 'scule'
import type { DropdownMenuItem, EditorCustomHandlers } from '@nuxt/ui'
import type { Editor, JSONContent } from '@tiptap/vue-3'
import { mapEditorItems } from '@nuxt/ui/utils/editor'

const CONVERTIBLE_TYPES = ['paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock', 'listItem', 'taskItem']

export function useEditorDragHandle<T extends EditorCustomHandlers>(customHandlers?: T) {
  const { tm: $tm } = useNuxtApp().$i18n as { tm: (key: string) => unknown }
  const dragHandleData = computed(() => $tm('dragHandle') as Record<string, string> | undefined)
  const toolbarData = computed(() => $tm('toolbar') as Record<string, string> | undefined)
  const selectedNode = ref<{ node: JSONContent | null, pos: number }>()

  const getTypeSpecificItems = (editor: Editor, nodeType: string): unknown[] => {
    const pos = selectedNode.value?.pos

    const dragHandle = dragHandleData.value
    const toolbar = toolbarData.value

    // Items for convertible block types
    if (CONVERTIBLE_TYPES.includes(nodeType)) {
      return [{
        label: dragHandle?.turnInto,
        icon: 'i-lucide-repeat-2',
        children: [
          { kind: 'paragraph', label: toolbar?.paragraph, icon: 'i-lucide-type' },
          { kind: 'heading', level: 1, label: toolbar?.heading1, icon: 'i-lucide-heading-1' },
          { kind: 'heading', level: 2, label: toolbar?.heading2, icon: 'i-lucide-heading-2' },
          { kind: 'heading', level: 3, label: toolbar?.heading3, icon: 'i-lucide-heading-3' },
          { kind: 'heading', level: 4, label: toolbar?.heading4, icon: 'i-lucide-heading-4' },
          { kind: 'bulletList', label: toolbar?.bulletList, icon: 'i-lucide-list' },
          { kind: 'orderedList', label: toolbar?.orderedList, icon: 'i-lucide-list-ordered' },
          { kind: 'taskList', label: toolbar?.taskList, icon: 'i-lucide-list-check' },
          { kind: 'blockquote', label: toolbar?.blockquote, icon: 'i-lucide-text-quote' },
          { kind: 'codeBlock', label: toolbar?.codeBlock, icon: 'i-lucide-square-code' }
        ]
      }, {
        kind: 'clearFormatting',
        pos,
        label: dragHandle?.resetFormatting,
        icon: 'i-lucide-rotate-ccw'
      }]
    }

    // Items for images
    if (nodeType === 'image') {
      const node = pos !== undefined ? editor.state.doc.nodeAt(pos) : null
      return [{
        label: dragHandle?.downloadImage,
        icon: 'i-lucide-download',
        to: node?.attrs?.src,
        download: true
      }]
    }

    // Items for tables
    if (nodeType === 'table') {
      return [{
        label: dragHandle?.clearAllContents,
        icon: 'i-lucide-square-x',
        onSelect: () => {
          if (pos === undefined) return
          const tableNode = editor.state.doc.nodeAt(pos)
          if (!tableNode) return

          // Collect all cell ranges first
          const cellRanges: { from: number, to: number }[] = []

          tableNode.descendants((node, nodePos) => {
            if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
              const cellStart = pos + 1 + nodePos + 1 // Position inside the cell
              const cellEnd = cellStart + node.content.size
              if (node.content.size > 0) {
                cellRanges.push({ from: cellStart, to: cellEnd })
              }
            }
            return true
          })

          // Delete in reverse order so positions stay valid
          const { tr } = editor.state
          cellRanges.reverse().forEach(({ from, to }) => {
            tr.delete(from, to)
          })

          editor.view.dispatch(tr)
        }
      }]
    }

    return []
  }

  const getItems = (editor: Editor): DropdownMenuItem[][] => {
    if (!selectedNode.value?.node?.type) {
      return []
    }

    const dragHandle = dragHandleData.value
    const nodeType = selectedNode.value.node.type
    const typeSpecificItems = getTypeSpecificItems(editor, nodeType)

    return mapEditorItems(editor, [[
      {
        type: 'label',
        label: upperFirst(nodeType)
      },
      ...typeSpecificItems
    ], [
      {
        kind: 'duplicate',
        pos: selectedNode.value?.pos,
        label: dragHandle?.duplicate,
        icon: 'i-lucide-copy'
      },
      {
        label: dragHandle?.copyToClipboard,
        icon: 'i-lucide-clipboard',
        onSelect: async () => {
          if (!selectedNode.value) return

          const pos = selectedNode.value.pos
          const node = editor.state.doc.nodeAt(pos)
          if (node) {
            await navigator.clipboard.writeText(node.textContent)
          }
        }
      }
    ], [
      {
        kind: 'moveUp',
        pos: selectedNode.value?.pos,
        label: dragHandle?.moveUp,
        icon: 'i-lucide-arrow-up'
      },
      {
        kind: 'moveDown',
        pos: selectedNode.value?.pos,
        label: dragHandle?.moveDown,
        icon: 'i-lucide-arrow-down'
      }
    ], [
      {
        kind: 'delete',
        pos: selectedNode.value?.pos,
        label: dragHandle?.delete,
        icon: 'i-lucide-trash'
      }
    ]], customHandlers) as DropdownMenuItem[][]
  }

  const onNodeChange = (event: { node: JSONContent | null, pos: number }) => {
    selectedNode.value = event
  }

  return {
    selectedNode,
    getItems,
    onNodeChange
  }
}
