<script lang="ts" setup>
import type { Editor } from '@tiptap/core'

interface EditorRefLike {
  editor?: unknown
}

interface Props {
  content: string
  editorRef: EditorRefLike | null
}

const props = defineProps<Props>()
const { tm: $tm, t } = useI18n()
const editorData = computed(() => $tm('editor') as Record<string, string> | undefined)

interface Heading {
  level: number
  text: string
  id: string
}

const headings = computed<Heading[]>(() => {
  const raw = props.content || ''
  const results: Heading[] = []
  const regex = /^(#{1,4})\s+(.+)$/gm
  let match
  while ((match = regex.exec(raw)) !== null) {
    const hashes = match[1]
    const text = match[2]
    if (!hashes || !text) continue
    const trimmed = text.trim()
    results.push({
      level: hashes.length,
      text: trimmed,
      id: `heading-${results.length}`
    })
  }
  return results
})

// 当前活跃的标题索引
const activeHeadingIndex = ref(-1)

// 折叠状态 (按层级分组)
const collapsedLevels = ref<Set<number>>(new Set())

// 切换折叠
function toggleCollapse(level: number) {
  if (collapsedLevels.value.has(level)) {
    collapsedLevels.value.delete(level)
  } else {
    collapsedLevels.value.add(level)
  }
}

// 判断标题是否可见（被父级折叠隐藏）
function isHeadingVisible(heading: Heading, index: number): boolean {
  // 遍历前面的标题，如果某个更高层级标题被折叠，则隐藏
  for (let i = index - 1; i >= 0; i--) {
    const h = headings.value[i]
    if (h && h.level < heading.level && collapsedLevels.value.has(h.level)) {
      return false
    }
  }
  return true
}

// 检查标题是否有子标题
function hasChildren(heading: Heading, index: number): boolean {
  for (let i = index + 1; i < headings.value.length; i++) {
    const h = headings.value[i]
    if (!h) continue
    if (h.level <= heading.level) return false
    return true
  }
  return false
}

// 判断该层级标题是否被折叠
function isLevelCollapsed(heading: Heading): boolean {
  return collapsedLevels.value.has(heading.level)
}

function scrollToHeading(heading: Heading, index: number) {
  const editor = (props.editorRef?.editor as Editor | null) ?? null
  if (!editor) return

  let found = false
  editor.state.doc.descendants((node, pos) => {
    if (
      node.type.name === 'heading'
      && node.attrs.level === heading.level
      && node.textContent.trim() === heading.text
    ) {
      editor.commands.setTextSelection(pos + 1)
      editor.commands.scrollIntoView()
      activeHeadingIndex.value = index
      found = true
      return false
    }
  })
  if (!found) {
    activeHeadingIndex.value = index
  }
}

// 使用 Intersection Observer 监听标题可见性
function setupScrollObserver() {
  const editor = (props.editorRef?.editor as Editor | null) ?? null
  if (!editor) return

  const container = editor.view.dom.closest('.tiptap') || editor.view.dom
  if (!container) return

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const targetText = entry.target.textContent?.trim() || ''
          const idx = headings.value.findIndex(h => h.text === targetText)
          if (idx !== -1) {
            activeHeadingIndex.value = idx
          }
        }
      }
    },
    {
      root: container.closest('.overflow-y-auto') || null,
      rootMargin: '-20px 0px -80% 0px',
      threshold: 0.1
    }
  )

  nextTick(() => {
    const headingElements = container.querySelectorAll('h1, h2, h3, h4')
    headingElements.forEach(el => observer.observe(el))
  })

  return observer
}

let observerCleanup: (() => void) | null = null

watch(
  () => props.editorRef,
  () => {
    if (observerCleanup) observerCleanup()
    const observer = setupScrollObserver()
    if (observer) {
      observerCleanup = () => observer.disconnect()
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  if (observerCleanup) observerCleanup()
})

const indentClass: Record<number, string> = {
  1: 'pl-0 font-semibold',
  2: 'pl-3',
  3: 'pl-6',
  4: 'pl-9 text-dimmed'
}

const allCollapsed = computed(() => {
  return headings.value.every((h, i) => {
    if (!hasChildren(h, i)) return true
    return collapsedLevels.value.has(h.level)
  })
})

function toggleAll() {
  if (allCollapsed.value) {
    collapsedLevels.value = new Set()
  } else {
    const levels = new Set<number>()
    headings.value.forEach((h, i) => {
      if (hasChildren(h, i)) levels.add(h.level)
    })
    collapsedLevels.value = levels
  }
}
</script>

<template>
  <div class="p-3">
    <div class="flex items-center justify-between mb-2 px-1">
      <p class="text-xs font-semibold text-muted uppercase tracking-wide">
        {{ editorData?.toc || t('editor.toc') }}
      </p>
      <button
        v-if="headings.length > 0"
        class="text-xs text-dimmed hover:text-default transition-colors"
        @click="toggleAll"
      >
        {{ allCollapsed ? (editorData?.tocExpand || t('editor.tocExpand')) : (editorData?.tocCollapse || t('editor.tocCollapse')) }}
      </button>
    </div>
    <div
      v-if="headings.length === 0"
      class="text-xs text-dimmed px-1"
    >
      {{ editorData?.tocEmpty || t('editor.tocEmpty') }}
    </div>
    <ul
      v-else
      class="space-y-0.5"
    >
      <li
        v-for="(heading, i) in headings"
        :key="i"
        v-show="isHeadingVisible(heading, i)"
      >
        <div class="flex items-center">
          <button
            v-if="hasChildren(heading, i)"
            class="shrink-0 p-0.5 rounded hover:bg-elevated mr-0.5 transition-transform"
            :class="{ '-rotate-90': isLevelCollapsed(heading) }"
            @click.stop="toggleCollapse(heading.level)"
          >
            <UIcon
              name="i-lucide-chevron-down"
              class="size-3 text-dimmed"
            />
          </button>
          <span
            v-else
            class="w-4 shrink-0"
          />
          <button
            :class="[
              'w-full text-left text-xs py-1 px-1 rounded truncate transition-colors',
              indentClass[heading.level] ?? 'pl-0',
              activeHeadingIndex === i
                ? 'bg-primary/10 text-primary font-medium'
                : 'hover:bg-elevated'
            ]"
            @click="scrollToHeading(heading, i)"
          >
            {{ heading.text }}
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
