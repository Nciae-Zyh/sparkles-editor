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
import { useFocusMode } from '~/composables/useFocusMode'

const { tm: $tm, t } = useI18n()

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

interface EditorRefLike {
  editor?: unknown
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
  placeholder: '',
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
const toast = useToast()

function requireAuth(): boolean {
  if (user.value) return true
  toast.add({
    title: editorData.value?.aiLoginRequired || t('editor.aiLoginRequired'),
    color: 'warning',
    icon: 'i-lucide-lock',
    duration: 3000
  })
  return false
}
const {
  saveDocument,
  getDocument,
  fetchVersions,
  createVersion,
  restoreVersion
} = useDocuments()
const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)
const appData = computed(() => $tm('app') as Record<string, string> | undefined)
const sharesData = computed(() => $tm('shares') as Record<string, string> | undefined)
const documentTitle = ref(props.documentTitle || (documentsData.value?.untitledDocument || t('documents.untitledDocument')))
const showShareModal = ref(false)
const showOutline = ref(false)
const safeLocalePath = useSafeLocalePath()
// 保存原始文档标题，用于自动保存（沿用用户设置的标题，不从内容提取）
const originalDocumentTitle = ref<string | null>(null)

const getErrorStatus = (error: unknown) => {
  if (error && typeof error === 'object') {
    const statusCode = (error as { statusCode?: unknown }).statusCode
    const status = (error as { status?: unknown }).status
    if (typeof statusCode === 'number') return statusCode
    if (typeof status === 'number') return status
  }
  return null
}

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
const checkDocumentExists = async (id?: string) => {
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
  } catch (error: unknown) {
    // 如果获取失败（404），说明是新文档，还未保存
    if (getErrorStatus(error) === 404) {
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
  if (props.placeholder?.trim()) {
    return props.placeholder
  }
  return editorData.value?.placeholder || t('editor.placeholder')
})

const editorRef = ref<EditorRefLike | null>(null)
const getEditorInstance = () => (editorRef.value?.editor as Editor | null) ?? null

// 自动保存相关
const autoSaveTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const isAutoSaving = ref(false)
const lastSavedAt = ref<Date | null>(null)
const lastSaveError = ref<string | null>(null)
const AUTO_SAVE_DELAY = 3000 // 3秒后自动保存

const saveStatus = computed(() => {
  if (isAutoSaving.value) {
    return {
      icon: 'i-lucide-loader-2',
      text: editorData.value?.autoSaving || t('editor.autoSaving'),
      class: 'text-xs text-muted',
      spin: true
    }
  }

  if (lastSaveError.value) {
    return {
      icon: 'i-lucide-circle-alert',
      text: lastSaveError.value,
      class: 'text-xs text-error',
      spin: false
    }
  }

  if (lastSavedAt.value) {
    return {
      icon: 'i-lucide-check',
      text: `${editorData.value?.saved || t('editor.saved')} ${lastSavedAt.value.toLocaleTimeString()}`,
      class: 'text-xs text-dimmed',
      spin: false
    }
  }

  return null
})

interface DocumentVersionItem {
  id: string
  title: string
  content_length: number
  created_at: number
}

const showVersionHistory = ref(false)
const versionLoading = ref(false)
const creatingVersion = ref(false)
const restoringVersionId = ref<string | null>(null)
const versions = ref<DocumentVersionItem[]>([])

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
      await saveDocument(titleToSave, content.value || '', documentId.value)
      lastSavedAt.value = new Date()
      lastSaveError.value = null
    } catch (error) {
      // 自动保存失败不显示错误提示，避免打扰用户
      console.error('Auto save failed:', error)
      lastSaveError.value = actionsData.value?.saveFailed || t('actions.saveFailed')
    } finally {
      isAutoSaving.value = false
    }
  }, AUTO_SAVE_DELAY)
})

// AI 续写处理函数（流式）
async function handleAIContinueAtPosition(editor: any, pos?: number) {
  if (!editor || !content.value) {
    return
  }

  const currentContent = content.value
  if (!currentContent.trim()) {
    alert(editorData.value?.aiContinueError || t('editor.aiContinueError'))
    return
  }

  try {
    isAIContinuing.value = true

    // 获取当前段落内容
    const { state } = editor
    const { selection } = state
    const currentPos = pos !== undefined ? pos : selection.from

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

    const afterBlockPos = $pos.depth >= 1 ? $pos.after(1) : state.doc.content.size

    // 使用流式输出，逐字追加到预览
    let streamedText = ''
    pendingAIResult.value = {
      text: '',
      label: editorData.value?.aiContinue || t('editor.aiContinue'),
      insertFn: () => {
        editor.chain()
          .focus()
          .insertContentAt(afterBlockPos, streamedText, { contentType: 'markdown' })
          .run()
      }
    }

    await streamContinue(currentContent, currentParagraph || undefined, (chunk) => {
      streamedText += chunk
      if (pendingAIResult.value) {
        pendingAIResult.value = { ...pendingAIResult.value, text: streamedText }
      }
    })

    // Finalize insertFn with complete text
    if (pendingAIResult.value) {
      pendingAIResult.value = {
        text: streamedText,
        label: editorData.value?.aiContinue || t('editor.aiContinue'),
        insertFn: () => {
          editor.chain()
            .focus()
            .insertContentAt(afterBlockPos, streamedText, { contentType: 'markdown' })
            .run()
        }
      }
    }
  } catch (error: unknown) {
    console.error('AI continue error:', error)
    pendingAIResult.value = null
    alert(aiError.value || editorData.value?.aiContinueError || t('editor.aiContinueError'))
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
    canExecute: (_editor: Editor) => !!content.value && content.value.trim().length > 0,
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
const { streamContinue, expandSelected, polishSelected, assist, error: aiError } = useAI()
const isAIContinuing = ref(false)
const isAIExpanding = ref(false)
const isAIPolishing = ref(false)
const isAIAssisting = ref(false)

// 专注模式
const { isFocusMode, toggleFocusMode, exitFocusMode } = useFocusMode()

// AI 侧边栏对话
const showAIChat = ref(false)
const showMobileChat = ref(false)

// AI 接受/拒绝预览
interface PendingAIResult {
  text: string
  label: string
  insertFn: () => void
}
const pendingAIResult = ref<PendingAIResult | null>(null)

const acceptAIResult = () => {
  if (pendingAIResult.value) {
    pendingAIResult.value.insertFn()
    pendingAIResult.value = null
  }
}

const rejectAIResult = () => {
  pendingAIResult.value = null
}

// 移除了从内容中提取标题的函数，因为用户希望沿用设置的标题，而不是自动从内容提取

// 自动保存逻辑已移至 watch([content, canSave]) 中

// 组件卸载时清理定时器
onUnmounted(() => {
  if (autoSaveTimer.value) {
    clearTimeout(autoSaveTimer.value)
  }
})

// 移除了监听语言变化的逻辑，因为多语言不会在页面内切换

function onCreate({ editor: _editor }: { editor: Editor }) {
  // Editor created
  // 如果是只读模式，禁用编辑器编辑
  if (props.readonly) {
    _editor.setEditable(false)
  }
}

// 监听 readonly 变化，动态设置编辑器是否可编辑
watch(() => props.readonly, (readonly) => {
  const editor = getEditorInstance()
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
  const editor = getEditorInstance()
  if (!editor) {
    console.warn(editorData.value?.editorNotReady || t('editor.editorNotReady'))
    return
  }

  editor.commands.setContent(markdown, { contentType: 'markdown' })
  content.value = markdown
}

// 导出Markdown内容
function exportMarkdown(): string {
  const editor = getEditorInstance()
  if (!editor) {
    console.warn(editorData.value?.editorNotReady || t('editor.editorNotReady'))
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
    console.error(editorData.value?.importFileFailed || t('editor.importFileFailed'), error)
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
      lastSaveError.value = null
    } catch (error) {
      console.error('Save failed:', error)
      lastSaveError.value = actionsData.value?.saveFailed || t('actions.saveFailed')
      alert(actionsData.value?.saveFailed || t('actions.saveFailed'))
    }
  } else {
    // 如果没有 documentId，触发保存按钮的点击（打开保存对话框）
    // 这里需要触发 SaveDocumentButton 的保存流程
    // 由于 SaveDocumentButton 是独立的组件，我们需要通过事件来触发
    // 暂时先提示用户
    alert(actionsData.value?.pleaseSaveFirst || t('actions.pleaseSaveFirst'))
  }
}

const loadVersions = async () => {
  if (!documentId.value || !hasBeenSaved.value || props.readonly) {
    versions.value = []
    return
  }

  versionLoading.value = true
  try {
    const data = await fetchVersions(documentId.value)
    versions.value = data as DocumentVersionItem[]
  } catch (error) {
    console.error('Load versions failed:', error)
    alert(actionsData.value?.loadFailed || t('actions.loadFailed'))
  } finally {
    versionLoading.value = false
  }
}

const openVersionHistory = async () => {
  showVersionHistory.value = true
  await loadVersions()
}

const createVersionSnapshot = async () => {
  if (!documentId.value || props.readonly) {
    return
  }

  creatingVersion.value = true
  try {
    await createVersion(documentId.value, content.value || '', originalDocumentTitle.value || documentTitle.value)
    await loadVersions()
  } catch (error) {
    console.error('Create version failed:', error)
    alert(actionsData.value?.saveFailed || t('actions.saveFailed'))
  } finally {
    creatingVersion.value = false
  }
}

const restoreVersionById = async (versionId: string) => {
  if (!documentId.value || props.readonly) {
    return
  }

  const restoreConfirm = confirm(documentsData.value?.restoreVersionConfirm || t('documents.restoreVersionConfirm'))
  if (!restoreConfirm) {
    return
  }

  restoringVersionId.value = versionId
  try {
    const result = await restoreVersion(documentId.value, versionId)
    if (result?.document?.title) {
      documentTitle.value = result.document.title
      originalDocumentTitle.value = result.document.title
    }

    const latestDocument = await getDocument(documentId.value)
    const latestContent = latestDocument.content || ''
    importMarkdown(latestContent)

    hasBeenSaved.value = true
    lastSavedAt.value = new Date()
    lastSaveError.value = null

    await loadVersions()
  } catch (error) {
    console.error('Restore version failed:', error)
    alert(actionsData.value?.saveFailed || t('actions.saveFailed'))
  } finally {
    restoringVersionId.value = null
  }
}

// AI 续写处理（工具栏按钮使用）
async function handleAIContinue() {
  if (!requireAuth()) return
  const editor = getEditorInstance()
  if (!editor) return
  await handleAIContinueAtPosition(editor)
}

const handleEditorDocumentSaved = (id: string, savedTitle: string) => {
  documentId.value = id
  hasBeenSaved.value = true
  lastSavedAt.value = new Date()
  lastSaveError.value = null
  originalDocumentTitle.value = savedTitle
  documentTitle.value = savedTitle
  emit('document-saved', id)
}

// 选中扩写：用 AI 扩写选中的文本，替换选区（通过预览）
async function handleAIExpandSelected(editor: any) {
  if (!requireAuth()) return
  if (!editor || !content.value) return
  const { state } = editor
  const { from, to } = state.selection
  if (from === to) {
    alert(editorData.value?.aiExpandNoSelection || t('editor.aiExpandNoSelection'))
    return
  }
  const selectedText = state.doc.textBetween(from, to, ' ')
  if (!selectedText.trim()) {
    alert(editorData.value?.aiExpandNoSelection || t('editor.aiExpandNoSelection'))
    return
  }
  try {
    isAIExpanding.value = true
    const context = content.value
    const expandedText = await expandSelected(selectedText, context)
    pendingAIResult.value = {
      text: expandedText,
      label: editorData.value?.aiExpand || t('editor.aiExpand'),
      insertFn: () => {
        editor.chain()
          .focus()
          .setTextSelection({ from, to })
          .insertContent(expandedText, { contentType: 'markdown' })
          .run()
      }
    }
  } catch (error: unknown) {
    console.error('AI expand error:', error)
    alert(aiError.value || editorData.value?.aiExpandError || t('editor.aiExpandError'))
  } finally {
    isAIExpanding.value = false
  }
}

// 选中润色：用 AI 润色选中的文本，替换选区（通过预览）
async function handleAIPolishSelected(editor: any) {
  if (!requireAuth()) return
  if (!editor || !content.value) return
  const { state } = editor
  const { from, to } = state.selection
  if (from === to) {
    alert(editorData.value?.aiPolishNoSelection || t('editor.aiPolishNoSelection'))
    return
  }
  const selectedText = state.doc.textBetween(from, to, ' ')
  if (!selectedText.trim()) {
    alert(editorData.value?.aiPolishNoSelection || t('editor.aiPolishNoSelection'))
    return
  }
  try {
    isAIPolishing.value = true
    const context = content.value
    const polishedText = await polishSelected(selectedText, context)
    pendingAIResult.value = {
      text: polishedText,
      label: editorData.value?.aiPolish || t('editor.aiPolish'),
      insertFn: () => {
        editor.chain()
          .focus()
          .setTextSelection({ from, to })
          .insertContent(polishedText, { contentType: 'markdown' })
          .run()
      }
    }
  } catch (error: unknown) {
    console.error('AI polish error:', error)
    alert(aiError.value || editorData.value?.aiPolishError || t('editor.aiPolishError'))
  } finally {
    isAIPolishing.value = false
  }
}

// AI 辅助操作（翻译/改写/提取要点）通过预览
async function handleAIAssist(
  editor: any,
  action: 'rewrite' | 'translate' | 'action_items' | 'grammar' | 'simplify',
  label: string,
  options?: { tone?: string, targetLang?: string }
) {
  if (!requireAuth()) return
  if (!editor) return
  const { state } = editor
  const { from, to } = state.selection
  if (from === to) {
    alert(editorData.value?.aiExpandNoSelection || t('editor.aiExpandNoSelection'))
    return
  }
  const selectedText = state.doc.textBetween(from, to, ' ')
  if (!selectedText.trim()) {
    alert(editorData.value?.aiExpandNoSelection || t('editor.aiExpandNoSelection'))
    return
  }
  try {
    isAIAssisting.value = true
    const result = await assist(action, selectedText, {
      context: content.value,
      tone: options?.tone,
      targetLang: options?.targetLang
    })
    pendingAIResult.value = {
      text: result,
      label,
      insertFn: () => {
        editor.chain()
          .focus()
          .setTextSelection({ from, to })
          .insertContent(result, { contentType: 'markdown' })
          .run()
      }
    }
  } catch (error: unknown) {
    console.error('AI assist error:', error)
    alert(aiError.value || t('actions.serverError'))
  } finally {
    isAIAssisting.value = false
  }
}

// 气泡工具栏中 AI 操作按钮（扩写、润色、更多）
function getAIBubbleItems(editor: any) {
  const data = editorData.value
  return [[
    {
      icon: 'i-lucide-sparkles',
      label: data?.aiExpand || t('editor.aiExpand'),
      tooltip: { text: data?.aiExpandDesc || t('editor.aiExpandDesc') },
      loading: isAIExpanding.value,
      onClick: () => handleAIExpandSelected(editor)
    },
    {
      icon: 'i-lucide-wand-2',
      label: data?.aiPolish || t('editor.aiPolish'),
      tooltip: { text: data?.aiPolishDesc || t('editor.aiPolishDesc') },
      loading: isAIPolishing.value,
      onClick: () => handleAIPolishSelected(editor)
    },
    {
      icon: 'i-lucide-chevron-down',
      label: data?.aiMoreActions || t('editor.aiMoreActions'),
      tooltip: { text: data?.aiMoreActions || t('editor.aiMoreActions') },
      loading: isAIAssisting.value,
      slot: 'aiMore'
    }
  ]]
}

// 更多 AI 操作的下拉菜单 items
function getAIMoreDropdownItems(editor: any) {
  const data = editorData.value
  return [
    [
      {
        label: data?.aiTranslateToChinese || t('editor.aiTranslateToChinese'),
        icon: 'i-lucide-languages',
        onSelect: () => handleAIAssist(editor, 'translate', data?.aiTranslateToChinese || t('editor.aiTranslateToChinese'), { targetLang: 'Chinese' })
      },
      {
        label: data?.aiTranslateToEnglish || t('editor.aiTranslateToEnglish'),
        icon: 'i-lucide-languages',
        onSelect: () => handleAIAssist(editor, 'translate', data?.aiTranslateToEnglish || t('editor.aiTranslateToEnglish'), { targetLang: 'English' })
      }
    ],
    [
      {
        label: data?.aiFormalTone || t('editor.aiFormalTone'),
        icon: 'i-lucide-briefcase',
        onSelect: () => handleAIAssist(editor, 'rewrite', data?.aiFormalTone || t('editor.aiFormalTone'), { tone: 'formal' })
      },
      {
        label: data?.aiCasualTone || t('editor.aiCasualTone'),
        icon: 'i-lucide-smile',
        onSelect: () => handleAIAssist(editor, 'rewrite', data?.aiCasualTone || t('editor.aiCasualTone'), { tone: 'casual' })
      }
    ],
    [
      {
        label: data?.aiGrammar || t('editor.aiGrammar'),
        icon: 'i-lucide-spell-check',
        onSelect: () => handleAIAssist(editor, 'grammar', data?.aiGrammar || t('editor.aiGrammar'))
      },
      {
        label: data?.aiSimplify || t('editor.aiSimplify'),
        icon: 'i-lucide-minimize-2',
        onSelect: () => handleAIAssist(editor, 'simplify', data?.aiSimplify || t('editor.aiSimplify'))
      },
      {
        label: data?.aiExtractKeyPoints || t('editor.aiExtractKeyPoints'),
        icon: 'i-lucide-list-checks',
        onSelect: () => handleAIAssist(editor, 'action_items', data?.aiExtractKeyPoints || t('editor.aiExtractKeyPoints'))
      }
    ]
  ]
}

// 合并格式工具栏与「选中扩写」按钮，供气泡工具栏使用
function getMergedBubbleItems(editor: any) {
  const base = bubbleToolbarItems.value ?? []
  const aiItems = getAIBubbleItems(editor)
  return [...base, ...aiItems]
}

// 定义快捷键
defineShortcuts({
  meta_s: {
    handler: (e: KeyboardEvent) => {
      e.preventDefault()
      handleSave()
    },
    usingInput: false // 不在输入框中时触发
  },
  ctrl_s: {
    handler: (e: KeyboardEvent) => {
      e.preventDefault()
      handleSave()
    },
    usingInput: false
  },
  meta_shift_f: {
    handler: () => toggleFocusMode(),
    usingInput: false
  },
  ctrl_shift_f: {
    handler: () => toggleFocusMode(),
    usingInput: false
  },
  escape: {
    handler: () => {
      if (isFocusMode.value) exitFocusMode()
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
            :class="[
              'sticky top-0 z-50 flex items-center bg-default/80 backdrop-blur-md border-b border-default shadow-sm transition-opacity duration-300',
              isFocusMode ? 'opacity-0 hover:opacity-100' : ''
            ]"
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
                        @update:model-value="(val: string) => emit('update:renameInput', val)"
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
                        {{ editorData?.aiContinue || t('editor.aiContinue') }}
                      </span>
                    </UButton>
                  </div>
                </div>
                <!-- Mobile-only AI Chat button -->
                <UButton
                  v-if="!readonly"
                  icon="i-lucide-message-square-text"
                  size="sm"
                  variant="soft"
                  color="primary"
                  class="lg:hidden"
                  @click="showMobileChat = true"
                />

                <div class="hidden lg:flex shrink-0 items-center gap-1">
                  <UTooltip :text="editorData?.outline || t('editor.outline')">
                    <UButton
                      v-if="!readonly"
                      icon="i-lucide-list-tree"
                      size="sm"
                      :variant="showOutline && !showAIChat ? 'solid' : 'soft'"
                      color="primary"
                      @click="showOutline = !showOutline; if (showOutline) showAIChat = false"
                    />
                  </UTooltip>
                  <UTooltip :text="editorData?.aiChat || t('editor.aiChat')">
                    <UButton
                      v-if="!readonly"
                      icon="i-lucide-message-square-text"
                      size="sm"
                      :variant="showAIChat ? 'solid' : 'soft'"
                      color="primary"
                      @click="showAIChat = !showAIChat; if (showAIChat) showOutline = false"
                    />
                  </UTooltip>
                  <UTooltip :text="isFocusMode ? (editorData?.exitFocusMode || t('editor.exitFocusMode')) : (editorData?.focusMode || t('editor.focusMode'))">
                    <UButton
                      :icon="isFocusMode ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'"
                      size="sm"
                      :variant="isFocusMode ? 'solid' : 'soft'"
                      color="primary"
                      @click="toggleFocusMode"
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
                    <span v-if="!$device.isMobile">{{ sharesData?.shareDocument || t('shares.shareDocument') }}</span>
                  </UButton>
                  <UButton
                    v-if="user"
                    :to="safeLocalePath('/shares')"
                    icon="i-lucide-link"
                    size="sm"
                    variant="soft"
                    color="primary"
                  >
                    <span v-if="!$device.isMobile">{{ appData?.myShares || t('app.myShares') }}</span>
                  </UButton>
                  <UButton
                    v-if="user && documentId && hasBeenSaved && !readonly"
                    icon="i-lucide-history"
                    size="sm"
                    variant="soft"
                    color="primary"
                    @click="openVersionHistory"
                  >
                    <span v-if="!$device.isMobile">{{ documentsData?.versionHistory || t('documents.versionHistory') }}</span>
                  </UButton>
                  <DocumentsSaveDocumentButton
                    v-if="user && canSave"
                    :content="content || ''"
                    :document-id="documentId"
                    :title="documentTitle"
                    @saved="handleEditorDocumentSaved"
                  />
                  <div
                    v-if="user && canSave && saveStatus"
                    class="flex items-center gap-1"
                    :class="saveStatus.class"
                  >
                    <UIcon
                      class="w-3 h-3"
                      :class="{ 'animate-spin': saveStatus.spin }"
                      :name="saveStatus.icon"
                    />
                    <span>{{ saveStatus.text }}</span>
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
            <template #aiMore>
              <UDropdownMenu
                :items="getAIMoreDropdownItems(editor)"
                :content="{ align: 'start' }"
                :ui="{ content: 'w-52' }"
              >
                <UButton
                  icon="i-lucide-chevron-down"
                  size="sm"
                  variant="ghost"
                  color="neutral"
                  :loading="isAIAssisting"
                >
                  {{ editorData?.aiMoreActions || t('editor.aiMoreActions') }}
                </UButton>
              </UDropdownMenu>
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
        <EditorWordCountBar
          v-if="!readonly && !isFocusMode"
          :content="content || ''"
        />
      </div>
      <div
        v-show="showOutline && !readonly && !showAIChat && !isFocusMode"
        class="hidden lg:flex flex-col w-48 border-l border-default overflow-y-auto shrink-0"
      >
        <EditorDocumentOutline
          :content="content || ''"
          :editor-ref="editorRef"
        />
      </div>
      <!-- AI Chat Panel -->
      <!-- Desktop AI Chat panel -->
      <div
        v-show="showAIChat && !readonly"
        class="hidden lg:flex flex-col w-80 shrink-0"
      >
        <EditorAIChatPanel
          :document-content="content || ''"
          :document-id="props.documentId"
          @insert="(html: string) => {
            const editor = getEditorInstance()
            if (editor) {
              editor.chain().focus().insertContent(html).run()
            }
          }"
          @close="showAIChat = false"
        />
      </div>
    </div>

    <!-- Mobile AI Chat modal -->
    <UModal
      v-model:open="showMobileChat"
      :ui="{ content: 'h-[90dvh] flex flex-col p-0 gap-0 rounded-t-2xl rounded-b-none sm:rounded-2xl max-w-lg' }"
      class="lg:hidden"
    >
      <template #content>
        <EditorAIChatPanel
          :document-content="content || ''"
          :document-id="props.documentId"
          class="h-full"
          @insert="(html: string) => {
            const editor = getEditorInstance()
            if (editor) {
              editor.chain().focus().insertContent(html).run()
            }
            showMobileChat = false
          }"
          @close="showMobileChat = false"
        />
      </template>
    </UModal>

    <!-- AI 结果预览卡片 -->
    <Transition
      enter-active-class="transition-all duration-300"
      enter-from-class="opacity-0 translate-y-4"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-200"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-4"
    >
      <div
        v-if="pendingAIResult"
        class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-xl px-4"
      >
        <UCard
          :ui="{
            root: 'shadow-xl border border-primary/20',
            body: 'p-4 space-y-3'
          }"
        >
          <template #header>
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <UIcon
                  name="i-lucide-sparkles"
                  class="w-4 h-4 text-primary"
                />
                <span class="text-sm font-semibold text-primary">
                  {{ editorData?.aiPreviewTitle || t('editor.aiPreviewTitle') }}
                </span>
                <UBadge
                  size="xs"
                  variant="soft"
                >
                  {{ pendingAIResult.label }}
                </UBadge>
              </div>
              <UButton
                icon="i-lucide-x"
                size="xs"
                variant="ghost"
                color="neutral"
                @click="rejectAIResult"
              />
            </div>
          </template>

          <div class="text-sm text-muted max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed border border-default rounded-md p-3 bg-muted/30">
            <template v-if="!pendingAIResult.text && isAIContinuing">
              <span class="inline-flex items-center gap-1.5">
                <UIcon
                  name="i-lucide-loader-2"
                  class="w-3.5 h-3.5 animate-spin"
                />
                {{ editorData?.aiStreamContinue || t('editor.aiStreamContinue') }}
              </span>
            </template>
            <template v-else>
              {{ pendingAIResult.text.slice(0, 500) }}
              <span
                v-if="isAIContinuing"
                class="inline-block w-0.5 h-4 bg-current ml-0.5 animate-pulse"
              />
              <span
                v-else-if="pendingAIResult.text.length > 500"
                class="text-muted"
              > ...</span>
            </template>
          </div>

          <div class="flex justify-end gap-2">
            <UButton
              icon="i-lucide-x"
              size="sm"
              variant="soft"
              color="error"
              :disabled="isAIContinuing"
              @click="rejectAIResult"
            >
              {{ editorData?.aiPreviewReject || t('editor.aiPreviewReject') }}
            </UButton>
            <UButton
              icon="i-lucide-check"
              size="sm"
              :disabled="isAIContinuing || !pendingAIResult.text"
              @click="acceptAIResult"
            >
              {{ editorData?.aiPreviewAccept || t('editor.aiPreviewAccept') }}
            </UButton>
          </div>
        </UCard>
      </div>
    </Transition>

    <!-- 分享模态框 -->
    <DocumentsShareDocumentModal
      v-if="documentId"
      v-model:open="showShareModal"
      :document-id="documentId"
      :document-title="documentTitle"
    />

    <UModal
      v-model:open="showVersionHistory"
      :title="documentsData?.versionHistory || t('documents.versionHistory')"
      :ui="{ footer: 'justify-between' }"
    >
      <template #body>
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-3">
            <p class="text-sm text-muted">
              {{ documentsData?.versionHistoryDesc || t('documents.versionHistoryDesc') }}
            </p>
            <UButton
              :disabled="readonly || !documentId"
              :loading="creatingVersion"
              icon="i-lucide-camera"
              size="xs"
              @click="createVersionSnapshot"
            >
              {{ documentsData?.createSnapshot || t('documents.createSnapshot') }}
            </UButton>
          </div>

          <div
            v-if="versionLoading"
            class="py-8 flex justify-center"
          >
            <UIcon
              name="i-lucide-loader-2"
              class="w-5 h-5 animate-spin"
            />
          </div>

          <div
            v-else-if="versions.length === 0"
            class="text-sm text-muted py-8 text-center"
          >
            {{ documentsData?.noVersions || t('documents.noVersions') }}
          </div>

          <div
            v-else
            class="max-h-[360px] overflow-y-auto space-y-2"
          >
            <div
              v-for="version in versions"
              :key="version.id"
              class="p-3 border border-default rounded-md flex items-center justify-between gap-3"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium truncate">
                  {{ version.title || (documentsData?.untitledDocument || t('documents.untitledDocument')) }}
                </p>
                <p class="text-xs text-muted mt-1">
                  {{ new Date(version.created_at * 1000).toLocaleString() }} · {{ version.content_length || 0 }} chars
                </p>
              </div>
              <UButton
                :loading="restoringVersionId === version.id"
                :disabled="readonly"
                color="warning"
                icon="i-lucide-rotate-ccw"
                size="xs"
                variant="soft"
                @click="restoreVersionById(version.id)"
              >
                {{ documentsData?.restore || t('documents.restore') }}
              </UButton>
            </div>
          </div>
        </div>
      </template>

      <template #footer="{ close }">
        <UButton
          variant="soft"
          @click="close"
        >
          {{ actionsData?.close || t('actions.close') }}
        </UButton>
        <UButton
          variant="ghost"
          icon="i-lucide-refresh-cw"
          :loading="versionLoading"
          @click="loadVersions"
        >
          {{ actionsData?.refresh || t('actions.refresh') }}
        </UButton>
      </template>
    </UModal>
  </div>
</template>
