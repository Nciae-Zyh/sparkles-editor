<script lang="ts" setup>
import type { Editor } from '@tiptap/core'

interface EditorRefLike {
  editor?: Editor | null
}

interface Props {
  content: string
  editorRef: EditorRefLike | null
}

const props = defineProps<Props>()
const editorData = computed(() => $tm('editor') as Record<string, string> | undefined)

interface Heading {
  level: number
  text: string
}

const headings = computed<Heading[]>(() => {
  const raw = props.content || ''
  const results: Heading[] = []
  const regex = /^(#{1,4})\s+(.+)$/gm
  let match
  while ((match = regex.exec(raw)) !== null) {
    results.push({
      level: match[1].length,
      text: match[2].trim()
    })
  }
  return results
})

function scrollToHeading(heading: Heading) {
  const editor: Editor | null = props.editorRef?.editor ?? null
  if (!editor) return

  editor.state.doc.descendants((node, pos) => {
    if (
      node.type.name === 'heading'
      && node.attrs.level === heading.level
      && node.textContent.trim() === heading.text
    ) {
      editor.commands.setTextSelection(pos + 1)
      editor.commands.scrollIntoView()
      return false
    }
  })
}

const indentClass: Record<number, string> = {
  1: 'pl-0 font-semibold',
  2: 'pl-3',
  3: 'pl-6',
  4: 'pl-9 text-dimmed'
}
</script>

<template>
  <div class="p-3">
    <p class="text-xs font-semibold text-muted uppercase tracking-wide mb-2 px-1">
      {{ editorData?.outline || '文档大纲' }}
    </p>
    <div
      v-if="headings.length === 0"
      class="text-xs text-dimmed px-1"
    >
      {{ editorData?.outlineEmpty || '暂无标题' }}
    </div>
    <ul
      v-else
      class="space-y-0.5"
    >
      <li
        v-for="(heading, i) in headings"
        :key="i"
      >
        <button
          :class="[
            'w-full text-left text-xs py-1 px-1 rounded hover:bg-elevated truncate',
            indentClass[heading.level] ?? 'pl-0'
          ]"
          @click="scrollToHeading(heading)"
        >
          {{ heading.text }}
        </button>
      </li>
    </ul>
  </div>
</template>
