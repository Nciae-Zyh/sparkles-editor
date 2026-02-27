<script lang="ts" setup>
import type { EditorCustomHandlers } from '@nuxt/ui'
import type { Editor } from '@tiptap/core'
import { Emoji } from '@tiptap/extension-emoji'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { CellSelection } from 'prosemirror-tables'
import { CodeBlockShiki } from 'tiptap-extension-code-block-shiki'
import { ImageUpload } from '~/components/editor/ImageUploadExtension'
import { useAuth } from '~/composables/useAuth'
import { useDocuments } from '~/composables/useDocuments'
import { useSafeLocalePath } from '~/utils/safeLocalePath'

interface Props {
  placeholder?: string
  enableBeforeUnload?: boolean
  showImportExport?: boolean
  documentId?: string
  documentTitle?: string
  readonly?: boolean // 预览模式，不允许保存
  allowSave?: boolean // 是否允许保存（默认：有 documentId 或 allowSave=true 时允许）
  isRenaming?: boolean // 是否正在重命名（从父组件传入）
  renameInput?: string // 重命名输入值（从父组件传入）
  renameLoading?: boolean // 重命名加载状态
}

const emit = defineEmits<{
  'document-saved': [id: string]
  'start-rename': []
  'save-rename': []
  'cancel-rename': []
  'update:renameInput': [value: string]
  'imported': [content: string]
}>()

const props = withDefaults(defineProps<Props>(), {
  placeholder: '开始写作，输入 \'/\' 查看命令...',
  enableBeforeUnload: false,
  showImportExport: true,
  documentId: undefined,
  documentTitle: undefined,
  readonly: false,
  allowSave: undefined, // undefined 表示自动判断
  isRenaming: false,
  renameInput: '',
  renameLoading: false
})

const content = defineModel<string>()

const { user } = useAuth()
const { saveDocument, getDocument } = useDocuments()
const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)
const appData = computed(() => $tm('app') as Record<string, string> | undefined)
const sharesData = computed(() => $tm('shares') as Record<string, string> | undefined)
const documentTitle = ref(props.documentTitle || (documentsData.value?.untitledDocument || '未命名文档'))
const showShareModal = ref(false)
const showOutline = ref(false)
const safeLocalePath = useSafeLocalePath()
// 保存原始文档标题，用于自动保存（沿用用户设置的标题，不从内容提取）
const originalDocumentTitle = ref<string | null>(null)

// 监听 props.documentTitle 的变化，更新显示标题和原始标题
watch(() => props.documentTitle, (newTitle) => {
  if (newTitle) {
    documentTitle.value = newTitle
    // 如果原始标题还未设置，或者这是从服务器加载的标题，更新原始标题
    if (!originalDocumentTitle.value || hasBeenSaved.value) {
      originalDocumentTitle.value = newTitle
    }
  }
}, { immediate: true })
// 使用props.documentId作为初始值，如果提供了就使用（可能是新建时的临时ID）
const documentId = ref(props.documentId)
// 标记文档是否已经保存到服务器（用于控制自动保存）
const hasBeenSaved = ref(false)

// 检查文档是否已存在于服务器的函数
const checkDocumentExists = async (id: string) => {
  if (!id) {
    hasBeenSaved.value = false
    originalDocumentTitle.value = null
    return
  }

  try {
    const doc = await getDocument(id)
    // 如果获取成功，说明文档已存在，允许自动保存
    hasBeenSaved.value = true
    // 保存原始标题，用于自动保存（沿用用户设置的标题，不从内容提取）
    if (doc.title) {
      originalDocumentTitle.value = doc.title
      // 同时更新 documentTitle 显示
      documentTitle.value = doc.title
    }
  } catch (error: any) {
    // 如果获取失败（404），说明是新文档，还未保存
    if (error?.statusCode === 404 || error?.status === 404) {
      hasBeenSaved.value = false
      originalDocumentTitle.value = null
    } else {
      // 其他错误，保守处理，不允许自动保存
      hasBeenSaved.value = false
      originalDocumentTitle.value = null
    }
  }
}

// 监听props.documentId的变化（例如从首页传入的新建文档ID）
watch(() => props.documentId, async (newId) => {
  if (newId !== documentId.value) {
    documentId.value = newId
    // 检查文档是否已存在于服务器
    await checkDocumentExists(newId)
  }
}, { immediate: true })

// 组件挂载时，如果已有 documentId，也检查一次
onMounted(async () => {
  if (props.documentId) {
    await checkDocumentExists(props.documentId)
  }
  // 如果通过 props 传入了标题，设置为原始标题
  if (props.documentTitle && !originalDocumentTitle.value) {
    originalDocumentTitle.value = props.documentTitle
  }
})

// 判断是否允许保存
// readonly=true: 不允许保存（预览模式）
// allowSave 明确指定时使用指定值
// 否则：有 documentId 或 allowSave 未指定但需要保存时允许
const canSave = computed(() => {
  if (props.readonly) {
    return false // 预览模式不允许保存
  }
  if (props.allowSave !== undefined) {
    return props.allowSave // 明确指定时使用指定值
  }
  // 默认：有 documentId 时可以保存（编辑已存在的文档）
  // 或者 isNewDocument 且 allowSave 未指定时，需要明确设置 allowSave=true 才能保存
  return !!documentId.value
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

// 自动保存相关
const autoSaveTimer = ref<NodeJS.Timeout | null>(null)
const isAutoSaving = ref(false)
const lastSavedAt = ref<Date | null>(null)
const AUTO_SAVE_DELAY = 3000 // 3秒后自动保存

// 自动保存逻辑（只对已保存到服务器的文档且允许保存时）
watch([
  content,
  canSave,
  hasBeenSaved
], () => {
  // 如果不允许保存，不执行自动保存
  if (!canSave.value) {
    // 清除定时器
    if (autoSaveTimer.value) {
      clearTimeout(autoSaveTimer.value)
      autoSaveTimer.value = null
    }
    return
  }

  // 如果文档还未保存到服务器（第一次保存前），不自动保存
  if (!hasBeenSaved.value) {
    // 清除定时器
    if (autoSaveTimer.value) {
      clearTimeout(autoSaveTimer.value)
      autoSaveTimer.value = null
    }
    return
  }

  // 如果内容为空或只有空白，不保存
  if (!content.value || !content.value.trim()) {
    return
  }

  // 如果文档未保存（没有 documentId），不自动保存（需要手动保存）
  if (!documentId.value) {
    return
  }

  // 清除之前的定时器
  if (autoSaveTimer.value) {
    clearTimeout(autoSaveTimer.value)
  }

  // 设置新的自动保存定时器
  autoSaveTimer.value = setTimeout(async () => {
    try {
      isAutoSaving.value = true
      // 自动保存时使用原始标题，避免标题被覆盖
      const titleToSave = originalDocumentTitle.value || documentTitle.value
      await saveDocument(titleToSave, content.value, documentId.value)
      lastSavedAt.value = new Date()
    } catch (error) {
      // 自动保存失败不显示错误提示，避免打扰用户
      console.error('Auto save failed:', error)
    } finally {
      isAutoSaving.value = false
    }
  }, AUTO_SAVE_DELAY)
})

// AI 续写处理函数
async function handleAIContinueAtPosition(editor: Editor, pos?: number) {
  if (!editor || !content.value) {
    return
  }

  const currentContent = content.value
  if (!currentContent.trim()) {
    alert(editorData.value?.aiContinueError || '请先输入一些内容')
    return
  }

  try {
    isAIContinuing.value = true

    // 获取当前段落内容
    const { state } = editor
    const { selection } = state
    const currentPos = pos !== undefined ? pos : selection.from

    // 获取当前段落文本（作为 AI 续写的上下文）
    const $pos = state.doc.resolve(currentPos)
    const paragraph = $pos.parent
    let currentParagraph = ''
    if (paragraph && paragraph.type.name === 'paragraph') {
      currentParagraph = paragraph.textContent || ''
    } else {
      const node = state.doc.nodeAt(currentPos)
      if (node && node.isText) {
        currentParagraph = node.textContent || ''
      }
    }

    // 调用 AI 续写
    const continuedText = await continueWriting(currentContent, currentParagraph)

    // 在当前顶层块之后插入续写内容（作为新块，避免在段落内破坏 markdown 解析）
    const afterBlockPos = $pos.depth >= 1 ? $pos.after(1) : state.doc.content.size
    editor.chain()
      .focus()
      .insertContentAt(afterBlockPos, continuedText, { contentType: 'markdown' })
      .run()
  } catch (error: any) {
    console.error('AI continue error:', error)
    alert(aiError.value || editorData.value?.aiContinueError || '续写失败，请稍后重试')
  } finally {
    isAIContinuing.value = false
  }
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
  },
  aiContinue: {
    canExecute: (editor: Editor) => !!content.value && content.value.trim().length > 0,
    execute: (editor: Editor, options?: { pos?: number }) => {
      handleAIContinueAtPosition(editor, options?.pos)
    },
    isActive: () => false,
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

// AI 功能
const { continueWriting, expandSelected, polishSelected, loading: aiLoading, error: aiError } = useAI()
const isAIContinuing = ref(false)
const isAIExpanding = ref(false)
const isAIPolishing = ref(false)

// 移除了从内容中提取标题的函数，因为用户希望沿用设置的标题，而不是自动从内容提取

// 自动保存逻辑已移至 watch([content, canSave]) 中

// 组件卸载时清理定时器
onUnmounted(() => {
  if (autoSaveTimer.value) {
    clearTimeout(autoSaveTimer.value)
  }
})

// 移除了监听语言变化的逻辑，因为多语言不会在页面内切换

function onCreate({ editor: _editor}: { editor: Editor }) {
  // Editor created
  // 如果是只读模式，禁用编辑器编辑
  if (props.readonly) {
    _editor.setEditable(false)
  }
}

// 监听 readonly 变化，动态设置编辑器是否可编辑
watch(() => props.readonly, (readonly) => {
  const editor = editorRef.value?.editor
  if (editor) {
    editor.setEditable(!readonly)
  }
})

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

// 下载功能
const {
  downloadAsZip,
  isDownloading
} = useDownloadZip()

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

    // 如果用户已登录，切换到编辑状态
    if (user.value) {
      // 触发事件通知父组件切换到编辑状态
      emit('imported', text)
    }
  } catch (error) {
    console.error(editorData.value?.importFileFailed || '导入文件失败:', error)
    alert(actionsData.value?.importFailed)
  } finally {
    isImporting.value = false
    // 重置文件输入，允许重复选择同一文件
    target.value = ''
  }
}

// 保存文档的函数（供快捷键使用）
const handleSave = async () => {
  if (!user.value || !canSave.value) {
    return
  }

  // 如果有 documentId，直接保存
  if (documentId.value) {
    try {
      const titleToSave = originalDocumentTitle.value || documentTitle.value
      await saveDocument(titleToSave, content.value || '', documentId.value)
      hasBeenSaved.value = true
      lastSavedAt.value = new Date()
    } catch (error) {
      console.error('Save failed:', error)
      alert(actionsData.value?.saveFailed || '保存失败，请稍后重试')
    }
  } else {
    // 如果没有 documentId，触发保存按钮的点击（打开保存对话框）
    // 这里需要触发 SaveDocumentButton 的保存流程
    // 由于 SaveDocumentButton 是独立的组件，我们需要通过事件来触发
    // 暂时先提示用户
    alert(actionsData.value?.pleaseSaveFirst || '请先保存文档')
  }
}

// AI 续写处理（工具栏按钮使用）
async function handleAIContinue() {
  if (!editorRef.value?.editor) {
    return
  }
  await handleAIContinueAtPosition(editorRef.value.editor)
}

// 选中扩写：用 AI 扩写选中的文本，替换选区
async function handleAIExpandSelected(editor: Editor) {
  if (!editor || !content.value) {
    return
  }
  const { state } = editor
  const { from, to } = state.selection
  if (from === to) {
    alert(editorData.value?.aiExpandNoSelection || '请先选中要扩写的文本')
    return
  }
  const selectedText = state.doc.textBetween(from, to, ' ')
  if (!selectedText.trim()) {
    alert(editorData.value?.aiExpandNoSelection || '请先选中要扩写的文本')
    return
  }
  try {
    isAIExpanding.value = true
    const context = content.value
    const expandedText = await expandSelected(selectedText, context)
    editor.chain()
      .focus()
      .setTextSelection({ from, to })
      .insertContent(expandedText, { contentType: 'markdown' })
      .run()
  } catch (error: any) {
    console.error('AI expand error:', error)
    alert(aiError.value || editorData.value?.aiExpandError || '扩写失败，请稍后重试')
  } finally {
    isAIExpanding.value = false
  }
}

// 选中润色：用 AI 润色选中的文本，替换选区
async function handleAIPolishSelected(editor: Editor) {
  if (!editor || !content.value) {
    return
  }
  const { state } = editor
  const { from, to } = state.selection
  if (from === to) {
    alert(editorData.value?.aiPolishNoSelection || '请先选中要润色的文本')
    return
  }
  const selectedText = state.doc.textBetween(from, to, ' ')
  if (!selectedText.trim()) {
    alert(editorData.value?.aiPolishNoSelection || '请先选中要润色的文本')
    return
  }
  try {
    isAIPolishing.value = true
    const context = content.value
    const polishedText = await polishSelected(selectedText, context)
    editor.chain()
      .focus()
      .setTextSelection({ from, to })
      .insertContent(polishedText, { contentType: 'markdown' })
      .run()
  } catch (error: any) {
    console.error('AI polish error:', error)
    alert(aiError.value || editorData.value?.aiPolishError || '润色失败，请稍后重试')
  } finally {
    isAIPolishing.value = false
  }
}

// 气泡工具栏中「选中扩写」+「润色」按钮的 items
function getAIBubbleItems(editor: Editor) {
  const data = editorData.value
  return [[
    {
      icon: 'i-lucide-sparkles',
      label: data?.aiExpand || '选中扩写',
      tooltip: { text: data?.aiExpandDesc || '使用 AI 扩写选中内容' },
      onClick: () => handleAIExpandSelected(editor)
    },
    {
      icon: 'i-lucide-wand-2',
      label: data?.aiPolish || '润色',
      tooltip: { text: data?.aiPolishDesc || '使用 AI 润色选中内容' },
      onClick: () => handleAIPolishSelected(editor)
    }
  ]]
}

// 合并格式工具栏与「选中扩写」按钮，供气泡工具栏使用
function getMergedBubbleItems(editor: Editor) {
  const base = bubbleToolbarItems.value ?? []
  const aiItems = getAIBubbleItems(editor)
  return [...base, ...aiItems]
}

// 定义快捷键
defineShortcuts({
  meta_s: {
    handler: (e) => {
      e.preventDefault()
      handleSave()
    },
    usingInput: false // 不在输入框中时触发
  },
  ctrl_s: {
    handler: (e) => {
      e.preventDefault()
      handleSave()
    },
    usingInput: false
  },
  meta_k: {
    handler: () => {
      // 可以添加命令面板等功能
    }
  }
})

// 暴露方法给父组件
defineExpose({
  importMarkdown,
  exportMarkdown,
  handleSave
})
</script>

<template>
  <div class="editor-container h-full flex flex-col overflow-hidden">
    <div class="flex-1 min-h-0 flex overflow-hidden">
      <div class="flex-1 overflow-y-auto flex flex-col">
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
        :autofocus="!readonly"
        class="editor-wrapper"
        content-type="markdown"
        @create="onCreate"
        @update:model-value="onUpdate"
      >
        <div
          class="sticky top-0 z-50 flex items-center bg-default/80 backdrop-blur-md border-b border-default shadow-sm"
        >
          <div class="container mx-auto px-4 sm:px-6 lg:px-14">
            <div class="flex items-center justify-between gap-4 py-3">
              <div class="flex items-center gap-4 flex-1 min-w-0">
                <!-- 文档标题显示和重命名（在工具栏左侧） -->
                <div
                  v-if="documentId && documentTitle"
                  class="flex items-center gap-2 min-w-0 flex-shrink-0"
                >
                  <div
                    v-if="!props.isRenaming"
                    class="flex items-center gap-2 px-3 py-1.5 rounded-md border border-primary/20 bg-primary/5 dark:bg-primary/10"
                  >
                    <span class="text-sm font-medium truncate max-w-[200px]">
                      {{ documentTitle }}
                    </span>
                    <UButton
                      v-if="!readonly"
                      icon="i-lucide-pencil"
                      size="xs"
                      variant="ghost"
                      @click="$emit('start-rename')"
                    />
                  </div>
                  <div
                    v-else
                    class="flex items-center gap-1 px-3 py-1.5 rounded-md border border-primary/20 bg-primary/5 dark:bg-primary/10"
                  >
                    <UInput
                      :model-value="props.renameInput"
                      size="xs"
                      class="w-48"
                      autofocus
                      @update:model-value="(val) => emit('update:renameInput', val)"
                      @keyup.enter="$emit('save-rename')"
                      @keyup.esc="$emit('cancel-rename')"
                    />
                    <UButton
                      icon="i-lucide-check"
                      size="xs"
                      color="primary"
                      :loading="props.renameLoading"
                      @click="$emit('save-rename')"
                    />
                    <UButton
                      icon="i-lucide-x"
                      size="xs"
                      variant="ghost"
                      @click="$emit('cancel-rename')"
                    />
                  </div>
                </div>

                <!-- 工具栏 -->
                <div
                  v-if="!readonly"
                  class="flex-1 overflow-x-auto flex items-center gap-2"
                >
                  <UEditorToolbar
                    :editor="editor"
                    :items="toolbarItems"
                  />
                  <!-- 文章续写按钮 -->
                  <UButton
                    :loading="isAIContinuing"
                    :disabled="!content || !content.trim()"
                    color="primary"
                    icon="i-lucide-sparkles"
                    size="sm"
                    variant="soft"
                    @click="handleAIContinue"
                  >
                    <span v-if="!$device.isMobile">
                      {{ editorData?.aiContinue || '文章续写' }}
                    </span>
                  </UButton>
                </div>
              </div>
              <div class="hidden lg:flex shrink-0 items-center">
                <UTooltip :text="editorData?.outline || '文档大纲'">
                  <UButton
                    v-if="!readonly"
                    icon="i-lucide-list-tree"
                    size="sm"
                    :variant="showOutline ? 'solid' : 'soft'"
                    color="primary"
                    @click="showOutline = !showOutline"
                  />
                </UTooltip>
              </div>
              <div
                v-if="showImportExport"
                class="flex gap-2 flex-wrap shrink-0 items-center"
              >
                <input
                  ref="fileInputRef"
                  accept=".md,.markdown"
                  class="hidden"
                  type="file"
                  @change="handleFileImport"
                >
                <UTooltip
                  v-if="actionsData?.importMarkdown && actionsData.importMarkdown.length > 10"
                  :text="actionsData.importMarkdown"
                >
                  <UButton
                    :loading="isImporting"
                    color="primary"
                    icon="i-lucide-upload"
                    size="sm"
                    variant="soft"
                    @click="handleImportClick"
                  />
                </UTooltip>
                <UButton
                  v-else
                  :loading="isImporting"
                  color="primary"
                  icon="i-lucide-upload"
                  size="sm"
                  variant="soft"
                  @click="handleImportClick"
                >
                  <span v-if="!$device.isMobile">
                    {{ actionsData?.importMarkdown }}
                  </span>
                </UButton>
                <UTooltip
                  v-if="actionsData?.downloadMarkdown && actionsData.downloadMarkdown.length > 10"
                  :text="actionsData.downloadMarkdown"
                >
                  <UButton
                    :loading="isDownloading"
                    color="primary"
                    icon="i-lucide-download"
                    size="sm"
                    variant="soft"
                    @click="handleDownload"
                  />
                </UTooltip>
                <UButton
                  v-else
                  :loading="isDownloading"
                  color="primary"
                  icon="i-lucide-download"
                  size="sm"
                  variant="soft"
                  @click="handleDownload"
                >
                  <span v-if="!$device.isMobile">
                    {{ actionsData?.downloadMarkdown }}
                  </span>
                </UButton>
                <UButton
                  v-if="user && documentId && !readonly"
                  icon="i-lucide-share-2"
                  size="sm"
                  variant="soft"
                  color="primary"
                  @click="showShareModal = true"
                >
                  <span v-if="!$device.isMobile">{{ sharesData?.shareDocument || '分享' }}</span>
                </UButton>
                <UButton
                  v-if="user"
                  :to="safeLocalePath('/shares')"
                  icon="i-lucide-link"
                  size="sm"
                  variant="soft"
                  color="primary"
                >
                  <span v-if="!$device.isMobile">{{ appData?.myShares || '我的分享' }}</span>
                </UButton>
                <DocumentsSaveDocumentButton
                  v-if="user && canSave"
                  :content="content || ''"
                  :document-id="documentId"
                  :title="documentTitle"
                  @saved="(id, savedTitle) => {
                    documentId = id
                    hasBeenSaved = true // 标记文档已保存，允许自动保存
                    // 保存用户设置的标题作为原始标题，用于后续自动保存（沿用用户设置的标题，不从内容提取）
                    // savedTitle 是用户在 SaveDocumentButton 中手动输入的 pathInput.value
                    originalDocumentTitle.value = savedTitle
                    documentTitle.value = savedTitle
                    $emit('document-saved', id)
                  }"
                />
                <div
                  v-if="user && canSave && isAutoSaving"
                  class="flex items-center gap-1 text-xs text-muted"
                >
                  <UIcon
                    class="w-3 h-3 animate-spin"
                    name="i-lucide-loader-2"
                  />
                  <span>{{ editorData?.autoSaving || '自动保存中...' }}</span>
                </div>
                <div
                  v-if="user && canSave && lastSavedAt && !isAutoSaving"
                  class="text-xs text-dimmed"
                >
                  {{ editorData?.saved || '已保存' }}
                </div>
              </div>
            </div>
          </div>
        </div>
        <UEditorToolbar
          v-if="!readonly"
          :editor="editor"
          :items="getMergedBubbleItems(editor)"
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
          v-if="!readonly"
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
          v-if="!readonly"
          :editor="editor"
          :items="getTableToolbarItems(editor)"
          :should-show="({ editor, view }: any) => {
            return editor.state.selection instanceof CellSelection && view.hasFocus()
          }"
          layout="bubble"
        />

        <UEditorDragHandle
          v-if="!readonly"
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
      <EditorWordCountBar v-if="!readonly" :content="content || ''" />
      </div>
      <div
        v-show="showOutline && !readonly"
        class="hidden lg:flex flex-col w-48 border-l border-default overflow-y-auto shrink-0"
      >
        <EditorDocumentOutline :content="content || ''" :editor-ref="editorRef" />
      </div>
    </div>

    <!-- 分享模态框 -->
    <DocumentsShareDocumentModal
      v-if="documentId"
      v-model:open="showShareModal"
      :document-id="documentId"
      :document-title="documentTitle"
    />
  </div>
</template>
