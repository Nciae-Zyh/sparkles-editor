<script lang="ts" setup>
interface Props {
  oldContent: string
  newContent: string
}

const props = defineProps<Props>()

interface DiffLine {
  type: 'unchanged' | 'added' | 'removed'
  content: string
  oldLineNum?: number
  newLineNum?: number
}

const diffLines = computed<DiffLine[]>(() => {
  const oldLines = (props.oldContent || '').split('\n')
  const newLines = (props.newContent || '').split('\n')

  const result: DiffLine[] = []
  let oldIdx = 0
  let newIdx = 0

  // Simple line-by-line diff using LCS approach
  const lcs = computeLCS(oldLines, newLines)
  let lcsIdx = 0

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (lcsIdx < lcs.length && oldIdx < oldLines.length && newIdx < newLines.length
      && oldLines[oldIdx] === lcs[lcsIdx] && newLines[newIdx] === lcs[lcsIdx]) {
      // Lines match
      result.push({
        type: 'unchanged',
        content: oldLines[oldIdx],
        oldLineNum: oldIdx + 1,
        newLineNum: newIdx + 1
      })
      oldIdx++
      newIdx++
      lcsIdx++
    } else if (oldIdx < oldLines.length && (lcsIdx >= lcs.length || oldLines[oldIdx] !== lcs[lcsIdx])) {
      // Line was removed
      result.push({
        type: 'removed',
        content: oldLines[oldIdx],
        oldLineNum: oldIdx + 1
      })
      oldIdx++
    } else if (newIdx < newLines.length) {
      // Line was added
      result.push({
        type: 'added',
        content: newLines[newIdx],
        newLineNum: newIdx + 1
      })
      newIdx++
    }
  }

  return result
})

function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to find LCS
  const result: string[] = []
  let i = m, j = n
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1])
      i--
      j--
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }

  return result
}

const stats = computed(() => {
  const added = diffLines.value.filter(l => l.type === 'added').length
  const removed = diffLines.value.filter(l => l.type === 'removed').length
  return { added, removed }
})
</script>

<template>
  <div class="diff-viewer">
    <div class="flex items-center gap-3 mb-3 text-sm">
      <span class="text-success font-medium">+{{ stats.added }}</span>
      <span class="text-error font-medium">-{{ stats.removed }}</span>
    </div>
    <div class="border border-default rounded-lg overflow-hidden font-mono text-sm">
      <div
        v-for="(line, idx) in diffLines"
        :key="idx"
        class="flex"
        :class="{
          'bg-success/10': line.type === 'added',
          'bg-error/10': line.type === 'removed',
          'bg-default': line.type === 'unchanged'
        }"
      >
        <span
          class="w-10 shrink-0 text-center text-dimmed select-none border-r border-default py-0.5 text-xs leading-5"
        >{{ line.oldLineNum || '' }}</span>
        <span
          class="w-10 shrink-0 text-center text-dimmed select-none border-r border-default py-0.5 text-xs leading-5"
        >{{ line.newLineNum || '' }}</span>
        <span
          class="px-2 py-0.5 leading-5 whitespace-pre-wrap break-all flex-1"
          :class="{
            'text-success': line.type === 'added',
            'text-error': line.type === 'removed',
          }"
        >
          <span v-if="line.type === 'added'" class="mr-1 select-none">+</span>
          <span v-else-if="line.type === 'removed'" class="mr-1 select-none">-</span>
          <span v-else class="mr-1 select-none"> </span>
          {{ line.content }}
        </span>
      </div>
    </div>
  </div>
</template>
