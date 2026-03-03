<script lang="ts" setup>
interface Props {
  content: string
}

const props = defineProps<Props>()
const { tm: $tm, t } = useI18n()
const editorData = computed(() => $tm('editor') as Record<string, string> | undefined)

const stats = computed(() => {
  const raw = props.content || ''

  // Strip markdown syntax for a cleaner word/char count
  const stripped = raw
    .replace(/```[\s\S]*?```/g, ' ') // fenced code blocks
    .replace(/`[^`]*`/g, ' ') // inline code
    .replace(/!\[.*?\]\(.*?\)/g, ' ') // images
    .replace(/\[.*?\]\(.*?\)/g, ' ') // links
    .replace(/#{1,6}\s/g, '') // headings
    .replace(/[*_~|>#\-=]/g, '') // formatting chars
    .replace(/\s+/g, ' ')
    .trim()

  if (!stripped) {
    return { words: 0, chars: 0, readingMinutes: 0 }
  }

  // Count Chinese characters separately (each is a "word")
  const chineseChars = (stripped.match(/[\u4E00-\u9FFF\u3400-\u4DBF]/g) || []).length
  // Count non-Chinese words
  const nonChineseWords = stripped
    .replace(/[\u4E00-\u9FFF\u3400-\u4DBF]/g, '')
    .split(/\s+/)
    .filter((w: string) => w.length > 0).length

  const words = chineseChars + nonChineseWords
  const chars = stripped.replace(/\s/g, '').length
  const readingMinutes = Math.max(1, Math.ceil(words / 275))

  return { words, chars, readingMinutes }
})

const wordCountText = computed(() => {
  const tmpl = editorData.value?.wordCountWords
  if (tmpl) return tmpl.replace('{n}', String(stats.value.words)).replace('{0}', String(stats.value.words))
  return t('editor.wordCountWords', { n: stats.value.words })
})

const charCountText = computed(() => {
  const tmpl = editorData.value?.wordCountChars
  if (tmpl) return tmpl.replace('{n}', String(stats.value.chars)).replace('{0}', String(stats.value.chars))
  return t('editor.wordCountChars', { n: stats.value.chars })
})

const readingText = computed(() => {
  const tmpl = editorData.value?.wordCountReading
  if (tmpl) return tmpl.replace('{n}', String(stats.value.readingMinutes)).replace('{0}', String(stats.value.readingMinutes))
  return t('editor.wordCountReading', { n: stats.value.readingMinutes })
})
</script>

<template>
  <div class="flex items-center gap-3 px-4 py-1.5 text-xs text-dimmed border-t border-default bg-default/60 select-none">
    <span>{{ wordCountText }}</span>
    <span class="text-muted">·</span>
    <span>{{ charCountText }}</span>
    <span class="text-muted">·</span>
    <span>{{ readingText }}</span>
  </div>
</template>
