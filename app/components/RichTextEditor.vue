<script lang="ts" setup>
import type { EditorCustomHandlers } from '@nuxt/ui'
import type { Editor } from '@tiptap/core'
import { Emoji } from '@tiptap/extension-emoji'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { CellSelection } from 'prosemirror-tables'
import { CodeBlockShiki } from 'tiptap-extension-code-block-shiki'
import { ImageUpload } from '~/components/editor/ImageUploadExtension'

const { tm: $tm, t } = useI18n()

interface Props {
  modelValue?: string
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: ''
})

const editorRef = useTemplateRef('editorRef')

// Custom handlers for editor
const customHandlers = {
  imageUpload: {
    canExecute: (editor: Editor) => editor.can().insertContent({ type: 'imageUpload' }),
    execute: (editor: Editor) => editor.chain().focus().insertContent({ type: 'imageUpload' }),
    isActive: (editor: Editor) => editor.isActive('imageUpload'),
    isDisabled: undefined
  },
  table: {
    canExecute: (editor: Editor) => editor.can().insertTable({
      rows: 3,
      cols: 3,
      withHeaderRow: true
    }),
    execute: (editor: Editor) => editor.chain().focus().insertTable({
      rows: 3,
      cols: 3,
      withHeaderRow: true
    }),
    isActive: (editor: Editor) => editor.isActive('table'),
    isDisabled: undefined
  }
} satisfies EditorCustomHandlers

const { items: emojiItems } = useEditorEmojis()
const { items: suggestionItems } = useEditorSuggestions(customHandlers)
const {
  getItems: getDragHandleItems,
  onNodeChange
} = useEditorDragHandle(customHandlers)
const {
  toolbarItems,
  bubbleToolbarItems,
  getImageToolbarItems,
  getTableToolbarItems
} = useEditorToolbar(customHandlers)

const content = defineModel({
  default: () => t('editor.defaultContent'),
  type: 'string'
})

function onCreate({ editor: _editor }: { editor: Editor }) {
  // Editor created
}

function onUpdate(value: string) {
  content.value = value
  emit('update:modelValue', value)
}

const extensions = computed(() => [
  CodeBlockShiki.configure({
    defaultTheme: 'material-theme',
    themes: {
      light: 'material-theme-lighter',
      dark: 'material-theme-palenight'
    }
  }),
  Emoji,
  ImageUpload,
  TableKit,
  TaskList,
  TaskItem
])

const editorData = computed(() => $tm('editor') as Record<string, string> | undefined)
const placeholder = computed(() => {
  if (props.placeholder?.trim()) {
    return props.placeholder
  }
  return editorData.value?.placeholder || t('editor.placeholder')
})

// 导入Markdown内容
function importMarkdown(markdown: string) {
  const editor = editorRef.value?.editor
  if (!editor) {
    console.warn(editorData.value?.editorNotReady || t('editor.editorNotReady'))
    return
  }

  editor.commands.setContent(markdown, { contentType: 'markdown' })
  content.value = markdown
}

// 导出Markdown内容
function exportMarkdown(): string {
  const editor = editorRef.value?.editor
  if (!editor) {
    console.warn(editorData.value?.editorNotReady || t('editor.editorNotReady'))
    return content.value || ''
  }

  // UEditor在content-type="markdown"时，onUpdate会返回markdown格式的字符串
  return content.value || ''
}

// 暴露方法给父组件
defineExpose({
  importMarkdown,
  exportMarkdown
})
</script>

<template>
  <div class="editor-container">
    <AppHeader>
      <UEditorToolbar
        :editor="editorRef"
        :items="toolbarItems"
      />
    </AppHeader>
    <UEditor
      ref="editorRef"
      v-slot="{ editor, handlers }"
      :extensions="extensions"
      :handlers="customHandlers"
      :model-value="content"
      :placeholder="placeholder"
      :ui="{
        base: 'p-4 sm:p-6 lg:p-12',
        content: 'max-w-4xl mx-auto prose prose-sm sm:prose-base lg:prose-lg dark:prose-invert prose-headings:font-semibold prose-p:leading-relaxed prose-pre:bg-muted prose-pre:border prose-pre:border-border'
      }"
      autofocus
      class="editor-wrapper"
      content-type="markdown"
      @create="onCreate"
      @update:model-value="onUpdate"
    >
      <UEditorToolbar
        :editor="editor"
        :items="bubbleToolbarItems"
        :should-show="({ editor, view, state }: any) => {
          if (editor.isActive('imageUpload') || editor.isActive('image') || state.selection instanceof CellSelection) {
            return false
          }
          const { selection } = state
          return view.hasFocus() && !selection.empty
        }"
        layout="bubble"
      >
        <template #link>
          <EditorLinkPopover :editor="editor" />
        </template>
      </UEditorToolbar>

      <UEditorToolbar
        :editor="editor"
        :items="getImageToolbarItems(editor)"
        :should-show="({ editor, view }: any) => {
          return editor.isActive('image') && view.hasFocus()
        }"
        layout="bubble"
      >
        <template #imageAlt>
          <EditorImageAltPopover :editor="editor" />
        </template>
      </UEditorToolbar>

      <UEditorToolbar
        :editor="editor"
        :items="getTableToolbarItems(editor)"
        :should-show="({ editor, view }: any) => {
          return editor.state.selection instanceof CellSelection && view.hasFocus()
        }"
        layout="bubble"
      />

      <UEditorDragHandle
        v-slot="{ ui, onClick }"
        :editor="editor"
        @node-change="onNodeChange"
      >
        <UButton
          :class="ui.handle()"
          color="neutral"
          icon="i-lucide-plus"
          size="sm"
          variant="ghost"
          @click="(e: MouseEvent) => {
            e.stopPropagation()
            const node = onClick()

            handlers.suggestion?.execute(editor, { pos: node?.pos }).run()
          }"
        />

        <UDropdownMenu
          v-slot="{ open }"
          :content="{ side: 'left' }"
          :items="getDragHandleItems(editor)"
          :modal="false"
          :ui="{ content: 'w-48', label: 'text-xs' }"
          @update:open="editor.chain().setMeta('lockDragHandle', $event).run()"
        >
          <UButton
            :active="open"
            :class="ui.handle()"
            active-variant="soft"
            color="neutral"
            icon="i-lucide-grip-vertical"
            size="sm"
            variant="ghost"
          />
        </UDropdownMenu>
      </UEditorDragHandle>

      <UEditorEmojiMenu
        :editor="editor"
        :items="emojiItems"
      />
      <UEditorSuggestionMenu
        :editor="editor"
        :items="suggestionItems"
      />
    </UEditor>
  </div>
</template>
