<script lang="ts" setup>
const open = defineModel<boolean>('open', { default: false })

const { tm: $tm, t } = useI18n()
const editorData = computed(() => $tm('editor') as Record<string, string> | undefined)

const isMac = import.meta.client && /Mac|iPhone|iPad|iPod/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl'

interface ShortcutGroup {
  title: string
  shortcuts: { keys: string; description: string }[]
}

const shortcutGroups = computed<ShortcutGroup[]>(() => [
  {
    title: editorData.value?.shortcutsTitle || t('editor.shortcutsTitle'),
    shortcuts: [
      { keys: `${mod}+K`, description: editorData.value?.searchPlaceholder || t('editor.searchPlaceholder') },
      { keys: `${mod}+/`, description: editorData.value?.keyboardShortcuts || t('editor.keyboardShortcuts') },
      { keys: `${mod}+S`, description: t('documents.save') },
      { keys: `${mod}+Z`, description: t('toolbar.undo') },
      { keys: `${mod}+Shift+Z`, description: t('toolbar.redo') },
      { keys: `${mod}+B`, description: t('toolbar.bold') },
      { keys: `${mod}+I`, description: t('toolbar.italic') },
      { keys: `${mod}+U`, description: t('toolbar.underline') },
      { keys: `${mod}+Shift+X`, description: t('toolbar.strikethrough') },
      { keys: `${mod}+E`, description: t('toolbar.code') },
      { keys: `${mod}+Shift+H`, description: t('toolbar.highlight') },
      { keys: `${mod}+Shift+1`, description: `${t('toolbar.heading')} 1` },
      { keys: `${mod}+Shift+2`, description: `${t('toolbar.heading')} 2` },
      { keys: `${mod}+Shift+3`, description: `${t('toolbar.heading')} 3` },
      { keys: `${mod}+Shift+4`, description: `${t('toolbar.heading')} 4` },
      { keys: `${mod}+Shift+7`, description: t('toolbar.orderedList') },
      { keys: `${mod}+Shift+8`, description: t('toolbar.bulletList') },
      { keys: `${mod}+Shift+9`, description: t('toolbar.taskList') },
      { keys: `${mod}+Shift+B`, description: t('toolbar.blockquote') },
      { keys: `${mod}+Alt+C`, description: t('toolbar.codeBlock') },
      { keys: 'Tab', description: 'Indent' },
      { keys: 'Shift+Tab', description: 'Outdent' },
      { keys: '/', description: 'Slash commands' }
    ]
  }
])

function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === '/') {
    e.preventDefault()
    open.value = !open.value
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <UModal
    v-model:open="open"
    :title="editorData?.shortcutsTitle || t('editor.shortcutsTitle')"
    :ui="{ content: 'max-w-lg' }"
  >
    <template #body>
      <div class="space-y-1 max-h-[60vh] overflow-y-auto">
        <div
          v-for="group in shortcutGroups"
          :key="group.title"
        >
          <div
            v-for="shortcut in group.shortcuts"
            :key="shortcut.keys"
            class="flex items-center justify-between py-1.5"
          >
            <span class="text-sm text-default">{{ shortcut.description }}</span>
            <div class="flex items-center gap-1">
              <kbd
                v-for="(key, ki) in shortcut.keys.split('+')"
                :key="ki"
                class="inline-flex items-center justify-center min-w-[1.5rem] h-6 px-1.5 text-xs font-mono bg-elevated text-default border border-default rounded"
              >{{ key }}</kbd>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
