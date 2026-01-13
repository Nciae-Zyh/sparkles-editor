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
  placeholder?: string
  enableBeforeUnload?: boolean
  showImportExport?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '开始写作，输入 \'/\' 查看命令...',
  enableBeforeUnload: true,
  showImportExport: true
})

const editorData = computed(() => $tm('editor') as Record<string, string> | undefined)
const actionsData = computed(() => $tm('actions') as Record<string, string> | undefined)

// 使用 computed 来获取实际的 placeholder，如果 props.placeholder 是默认值则使用翻译
const placeholder = computed(() => {
  if (props.placeholder === '开始写作，输入 \'/\' 查看命令...') {
    return editorData.value?.placeholder || props.placeholder
  }
  return props.placeholder
})

const editorRef = ref<Editor | null>(null)

// 添加 beforeunload 拦截
const hasUnsavedChanges = ref(false)
if (props.enableBeforeUnload) {
  useBeforeUnload(hasUnsavedChanges)
}

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

// Default content - only used when Y.js document is empty
const defaultContent = computed(() => {
  return editorData.value?.defaultContent || ''
})

const content = defineModel<string>()

watch(content, () => {
  if (props.enableBeforeUnload) {
    hasUnsavedChanges.value = true
  }
})

// 监听语言变化，更新默认内容
watch(editorData, () => {
  if (!content.value) {
    content.value = defaultContent.value
  }
}, { deep: true })

function onCreate({ editor: _editor }: { editor: Editor }) {
  // Editor created
}

function onUpdate(value: string) {
  content.value = value
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

// 导入Markdown内容
function importMarkdown(markdown: string) {
  const editor = editorRef.value?.editor
  if (!editor) {
    console.warn('Editor not ready')
    return
  }

  editor.commands.setContent(markdown, { contentType: 'markdown' })
  content.value = markdown
}

// 导出Markdown内容
function exportMarkdown(): string {
  const editor = editorRef.value?.editor
  if (!editor) {
    console.warn('Editor not ready')
    return content.value || ''
  }

  // UEditor在content-type="markdown"时，onUpdate会返回markdown格式的字符串
  return content.value || ''
}

// 下载功能
const { downloadAsZip, isDownloading } = useDownloadZip()

async function handleDownload() {
  try {
    const markdown = exportMarkdown()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    await downloadAsZip(markdown, `editor-content-${timestamp}.zip`)
  } catch (error) {
    console.error('Download failed:', error)
    // 可以在这里添加错误提示
  }
}

// 导入Markdown文件功能
const fileInputRef = ref<HTMLInputElement | null>(null)
const isImporting = ref(false)

function handleImportClick() {
  fileInputRef.value?.click()
}

async function handleFileImport(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) {
    return
  }

  // 验证文件类型
  const fileName = file.name.toLowerCase()
  const isValidMarkdown = fileName.endsWith('.md') || fileName.endsWith('.markdown')

  if (!isValidMarkdown) {
    // 可以在这里添加错误提示，比如使用 toast
    console.error(actionsData.value?.onlyMarkdownFiles)
    alert(actionsData.value?.onlyMarkdownFiles)
    // 重置文件输入
    target.value = ''
    return
  }

  isImporting.value = true

  try {
    const text = await file.text()
    importMarkdown(text)
  } catch (error) {
    console.error('导入文件失败:', error)
    alert(actionsData.value?.importFailed)
  } finally {
    isImporting.value = false
    // 重置文件输入，允许重复选择同一文件
    target.value = ''
  }
}

// 暴露方法给父组件
defineExpose({
  importMarkdown,
  exportMarkdown
})
</script>

<template>
  <div class="editor-container">
    <UEditor
      ref="editorRef"
      v-slot="{ editor, handlers }"
      :extensions="extensions"
      :handlers="customHandlers"
      :model-value="content"
      :placeholder="placeholder.value"
      :ui="{
        base: 'p-6 sm:p-12',
        content: 'max-w-4xl mx-auto prose prose-sm sm:prose-base lg:prose-lg dark:prose-invert prose-headings:font-semibold prose-p:leading-relaxed prose-pre:bg-muted prose-pre:border prose-pre:border-border'
      }"
      autofocus
      class="editor-wrapper"
      content-type="markdown"
      @create="onCreate"
      @update:model-value="onUpdate"
    >
      <AppHeader>
        <UEditorToolbar
          :editor="editor"
          :items="toolbarItems"
        />
        <div v-if="showImportExport" class="flex gap-2">
          <input
            ref="fileInputRef"
            type="file"
            accept=".md,.markdown"
            class="hidden"
            @change="handleFileImport"
          >
          <UButton
            :loading="isImporting"
            color="primary"
            icon="i-lucide-upload"
            :label="actionsData?.importMarkdown"
            size="sm"
            variant="soft"
            @click="handleImportClick"
          />
          <UButton
            :loading="isDownloading"
            color="primary"
            icon="i-lucide-download"
            :label="actionsData?.downloadMarkdown"
            size="sm"
            variant="soft"
            @click="handleDownload"
          />
        </div>
      </AppHeader>
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
