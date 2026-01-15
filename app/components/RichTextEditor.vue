<script lang="ts" setup>
import type { EditorCustomHandlers } from '@nuxt/ui'
import type { Editor } from '@tiptap/core'
import { Emoji } from '@tiptap/extension-emoji'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { CellSelection } from 'prosemirror-tables'
import { CodeBlockShiki } from 'tiptap-extension-code-block-shiki'
import { ImageUpload } from '~/components/editor/ImageUploadExtension'

interface Props {
  modelValue?: string
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '开始写作，输入 \'/\' 查看命令...'
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
  default: `# 欢迎使用编辑器

这是一个功能丰富的富文本编辑器，支持多种格式和功能。

## 富文本编辑

支持 **粗体**、*斜体*、<u>下划线</u>、~~删除线~~ 和 \`行内代码\`。

![图片占位符](/placeholder.jpeg)

### 代码块

代码块支持语法高亮。

\`\`\`typescript
const greeting = 'Hello, World!'
console.log(greeting)
\`\`\`

### 列表

1. 有序列表
2. 自动编号

- 无序列表
  - 支持嵌套
  - 多级嵌套

- [ ] 任务列表
- [x] 已完成任务

### 表格

插入和编辑表格，支持行列操作。

| 功能 | 描述 | 状态 |
| ------- | ----------- | ------ |
| 表格 | 完整表格支持 | ✅ |
| Markdown | 内容序列化 | ✅ |

---

## 功能特性

### 工具栏

选择文本查看气泡工具栏，顶部固定工具栏提供快速访问常用操作。

### 拖拽手柄

使用左侧的拖拽手柄可以重新排序、复制、删除或转换块类型。

### 斜杠命令

输入 \`/\` 可以快速插入标题、列表、代码块、表格、图片等。

### 图片上传

支持自定义图片上传节点。

### 表情

使用 \`:\` 添加表情 🚀
`,
  type: 'string'
})

function onCreate({ editor: _editor}: { editor: Editor }) {
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

// 导入Markdown内容
function importMarkdown(markdown: string) {
  const editor = editorRef.value?.editor
  if (!editor) {
    console.warn(editorData.value?.editorNotReady || 'Editor not ready')
    return
  }

  editor.commands.setContent(markdown, { contentType: 'markdown' })
  content.value = markdown
}

// 导出Markdown内容
function exportMarkdown(): string {
  const editor = editorRef.value?.editor
  if (!editor) {
    console.warn(editorData.value?.editorNotReady || 'Editor not ready')
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
