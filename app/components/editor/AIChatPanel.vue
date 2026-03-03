<script lang="ts" setup>
import { marked } from 'marked'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  html?: string
}

interface AIRole {
  id: string
  icon: string
  labelKey: string
}

const AI_ROLES: AIRole[] = [
  { id: 'general',    icon: 'i-lucide-bot',            labelKey: 'aiRoleGeneral' },
  { id: 'academic',   icon: 'i-lucide-graduation-cap', labelKey: 'aiRoleAcademic' },
  { id: 'writer',     icon: 'i-lucide-pen-line',       labelKey: 'aiRoleWriter' },
  { id: 'civil',      icon: 'i-lucide-landmark',       labelKey: 'aiRoleCivil' },
  { id: 'copywriter', icon: 'i-lucide-megaphone',      labelKey: 'aiRoleCopywriter' },
  { id: 'translator', icon: 'i-lucide-languages',      labelKey: 'aiRoleTranslator' },
]

const props = defineProps<{
  documentContent?: string
  documentId?: string
}>()

const emit = defineEmits<{
  insert: [html: string]
  close: []
}>()

const { t, tm: $tm } = useI18n()
const editorData = computed(() => $tm('editor') as Record<string, string> | undefined)

const messages = ref<Message[]>([])
const inputText = ref('')
const isLoading = ref(false)
const isLoadingHistory = ref(false)
const messagesEndRef = ref<HTMLDivElement | null>(null)
const sessionId = ref(crypto.randomUUID())
const currentRoleId = ref('general')

const currentRole = computed(() => AI_ROLES.find(r => r.id === currentRoleId.value) ?? AI_ROLES[0]!)

const roleMenuItems = computed(() =>
  AI_ROLES.map(r => ({
    label: editorData.value?.[r.labelKey] || t(`editor.${r.labelKey}`),
    icon: r.icon,
    onSelect: () => { currentRoleId.value = r.id }
  }))
)

// Configure marked
marked.setOptions({ gfm: true, breaks: true })

function renderMarkdown(text: string): string {
  const html = marked.parse(text) as string
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
}

const scrollToBottom = () => {
  nextTick(() => {
    messagesEndRef.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

onMounted(async () => {
  if (!props.documentId) return
  isLoadingHistory.value = true
  try {
    const data = await $fetch<{
      sessionId: string | null
      messages: Array<{ id: string; role: 'user' | 'assistant'; content: string }>
    }>(`/api/ai/chat/history?documentId=${encodeURIComponent(props.documentId)}`)

    if (data.sessionId && data.messages.length > 0) {
      sessionId.value = data.sessionId
      messages.value = data.messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        streaming: false,
        html: m.role === 'assistant' ? renderMarkdown(m.content) : undefined
      }))
      scrollToBottom()
    }
  } catch {
    // Not logged in or no history — proceed with empty state
  } finally {
    isLoadingHistory.value = false
  }
})

const sendMessage = async () => {
  const text = inputText.value.trim()
  if (!text || isLoading.value) return

  const userMsg: Message = {
    id: crypto.randomUUID(),
    role: 'user',
    content: text
  }
  messages.value.push(userMsg)
  inputText.value = ''
  scrollToBottom()

  const assistantMsg: Message = {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: '',
    streaming: true
  }
  messages.value.push(assistantMsg)
  isLoading.value = true

  try {
    const historyMessages = messages.value
      .filter(m => !m.streaming && m.id !== assistantMsg.id)
      .map(m => ({ role: m.role, content: m.content }))

    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: historyMessages,
        documentContent: props.documentContent,
        sessionId: sessionId.value,
        documentId: props.documentId,
        role: currentRoleId.value
      })
    })

    if (response.status === 401) throw new Error('401')
    if (!response.ok) throw new Error(`Chat request failed: ${response.status}`)
    if (!response.body) throw new Error('No response body')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data === '[DONE]') break
          try {
            const parsed = JSON.parse(data) as { text?: string }
            if (parsed.text) {
              const idx = messages.value.findIndex(m => m.id === assistantMsg.id)
              if (idx !== -1) {
                const cur = messages.value[idx]!
                messages.value[idx] = {
                  id: cur.id,
                  role: cur.role,
                  content: cur.content + parsed.text,
                  streaming: true
                }
                scrollToBottom()
              }
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    }

    // Streaming done — render final markdown
    const idx = messages.value.findIndex(m => m.id === assistantMsg.id)
    if (idx !== -1) {
      const cur = messages.value[idx]!
      messages.value[idx] = {
        id: cur.id,
        role: cur.role,
        content: cur.content,
        streaming: false,
        html: renderMarkdown(cur.content)
      }
    }
  } catch (err) {
    console.error('Chat error:', err)
    const idx = messages.value.findIndex(m => m.id === assistantMsg.id)
    if (idx !== -1) {
      const cur = messages.value[idx]!
      const is401 = err instanceof Error && err.message === '401'
      const errText = is401
        ? (editorData.value?.aiLoginRequired || t('editor.aiLoginRequired'))
        : (editorData.value?.aiChatError || t('editor.aiChatError'))
      messages.value[idx] = {
        id: cur.id,
        role: cur.role,
        content: errText,
        streaming: false,
        html: renderMarkdown(errText)
      }
    }
  } finally {
    isLoading.value = false
    scrollToBottom()
  }
}

const clearHistory = async () => {
  const currentSessionId = sessionId.value
  messages.value = []
  sessionId.value = crypto.randomUUID()

  if (props.documentId) {
    try {
      await $fetch('/api/ai/chat/clear', {
        method: 'POST',
        body: { sessionId: currentSessionId }
      })
    } catch {
      // Ignore errors — local state is already reset
    }
  }
}

const insertMessage = (msg: Message) => {
  emit('insert', msg.html || msg.content)
}
</script>

<template>
  <div class="flex flex-col h-full bg-default border-l border-default">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2.5 border-b border-default shrink-0 gap-2">
      <!-- Role selector -->
      <UDropdownMenu :items="[roleMenuItems]" :content="{ align: 'start' }" :ui="{ content: 'w-44' }">
        <UButton
          :icon="currentRole.icon"
          size="xs"
          variant="ghost"
          color="neutral"
          trailing-icon="i-lucide-chevron-down"
          class="font-semibold text-sm min-w-0 shrink truncate"
        >
          <span class="truncate">{{ editorData?.[currentRole.labelKey] || t(`editor.${currentRole.labelKey}`) }}</span>
        </UButton>
      </UDropdownMenu>

      <!-- Actions -->
      <div class="flex items-center gap-1 shrink-0">
        <UTooltip :text="editorData?.aiChatClear || t('editor.aiChatClear')">
          <UButton
            icon="i-lucide-trash-2"
            size="xs"
            variant="ghost"
            color="neutral"
            :disabled="messages.length === 0"
            @click="clearHistory"
          />
        </UTooltip>
        <UButton
          icon="i-lucide-x"
          size="xs"
          variant="ghost"
          color="neutral"
          @click="$emit('close')"
        />
      </div>
    </div>

    <!-- Messages -->
    <div class="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
      <!-- History loading state -->
      <div
        v-if="isLoadingHistory"
        class="h-full flex flex-col items-center justify-center gap-2"
      >
        <UIcon
          name="i-lucide-loader-2"
          class="w-5 h-5 text-muted animate-spin"
        />
      </div>

      <template v-else>
        <div
          v-if="messages.length === 0"
          class="h-full flex flex-col items-center justify-center text-center gap-3 py-8"
        >
          <UIcon
            :name="currentRole.icon"
            class="w-8 h-8 text-primary/50"
          />
          <div class="space-y-1">
            <p class="text-sm font-medium text-default">
              {{ editorData?.[currentRole.labelKey] || t(`editor.${currentRole.labelKey}`) }}
            </p>
            <p class="text-xs text-muted max-w-48">
              {{ editorData?.aiChatPlaceholder || t('editor.aiChatPlaceholder') }}
            </p>
          </div>
        </div>

        <template
          v-for="msg in messages"
          :key="msg.id"
        >
          <!-- User message -->
          <div
            v-if="msg.role === 'user'"
            class="flex justify-end"
          >
            <div class="bg-primary text-white rounded-2xl rounded-tr-sm px-3.5 py-2 max-w-[85%] text-sm leading-relaxed whitespace-pre-wrap">
              {{ msg.content }}
            </div>
          </div>

          <!-- Assistant message -->
          <div
            v-else
            class="flex flex-col gap-1"
          >
            <div class="bg-muted rounded-2xl rounded-tl-sm px-3.5 py-2 max-w-[95%] text-sm">
              <!-- Loading state -->
              <template v-if="msg.streaming && !msg.content">
                <span class="inline-flex items-center gap-1.5 text-muted">
                  <UIcon
                    name="i-lucide-loader-2"
                    class="w-3 h-3 animate-spin"
                  />
                  {{ editorData?.aiChatTyping || t('editor.aiChatTyping') }}
                </span>
              </template>

              <!-- Streaming: raw text + blinking cursor -->
              <template v-else-if="msg.streaming">
                <span class="leading-relaxed whitespace-pre-wrap">{{ msg.content }}</span>
                <span class="inline-block w-0.5 h-[1em] bg-current ml-0.5 align-middle animate-pulse" />
              </template>

              <!-- eslint-disable vue/no-v-html -->
              <!-- Done: rendered markdown (XSS-safe: <script> tags stripped) -->
              <div
                v-else-if="msg.html"
                class="prose prose-sm dark:prose-invert max-w-none
                  [&_p]:my-1 [&_p]:leading-relaxed
                  [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_h4]:text-sm
                  [&_h1,&_h2,&_h3,&_h4]:font-semibold [&_h1,&_h2,&_h3,&_h4]:my-2
                  [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_ul]:pl-4 [&_ol]:pl-4
                  [&_pre]:my-2 [&_pre]:text-xs [&_pre]:rounded-md [&_pre]:p-3 [&_pre]:overflow-x-auto
                  [&_code]:text-xs [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-black/10 dark:[&_:not(pre)>code]:bg-white/10
                  [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted
                  [&_hr]:my-2
                  [&_table]:text-xs [&_th]:py-1 [&_td]:py-1 [&_th]:px-2 [&_td]:px-2
                  [&_a]:text-primary [&_a]:underline"
                v-html="msg.html"
              />
              <!-- eslint-enable vue/no-v-html -->

              <!-- Fallback: raw text -->
              <template v-else>
                <span class="leading-relaxed whitespace-pre-wrap">{{ msg.content }}</span>
              </template>
            </div>

            <div
              v-if="!msg.streaming && msg.content"
              class="flex"
            >
              <UButton
                icon="i-lucide-clipboard-paste"
                size="xs"
                variant="ghost"
                color="neutral"
                @click="insertMessage(msg)"
              >
                {{ editorData?.aiChatInsert || t('editor.aiChatInsert') }}
              </UButton>
            </div>
          </div>
        </template>
      </template>
      <div ref="messagesEndRef" />
    </div>

    <!-- Input -->
    <div class="px-3 py-2.5 border-t border-default shrink-0">
      <div class="flex gap-2 items-end">
        <UTextarea
          v-model="inputText"
          :placeholder="editorData?.aiChatPlaceholder || t('editor.aiChatPlaceholder')"
          class="flex-1"
          size="sm"
          :rows="1"
          autoresize
          :maxrows="4"
          :disabled="isLoading"
          @keydown.enter.exact.prevent="sendMessage"
          @keydown.enter.shift.exact="inputText += '\n'"
        />
        <UButton
          icon="i-lucide-send"
          size="sm"
          :loading="isLoading"
          :disabled="!inputText.trim()"
          class="shrink-0 mb-0.5"
          @click="sendMessage"
        />
      </div>
      <p class="text-xs text-muted mt-1.5 hidden sm:block">
        Enter ↵ 发送 &nbsp;·&nbsp; Shift+Enter 换行
      </p>
    </div>
  </div>
</template>
