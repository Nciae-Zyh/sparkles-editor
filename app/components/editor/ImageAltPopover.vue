<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'

const props = defineProps<{
  editor: Editor
  autoOpen?: boolean
}>()

const open = ref(false)
const alt = ref('')

const active = computed(() => props.editor.isActive('image'))
const disabled = computed(() => {
  if (!props.editor.isEditable) return true
  return !props.editor.isActive('image')
})

watch(() => props.editor, (editor, _, onCleanup) => {
  if (!editor) return

  const updateAlt = () => {
    if (editor.isActive('image')) {
      const { alt: imageAlt } = editor.getAttributes('image')
      alt.value = imageAlt || ''
    } else {
      alt.value = ''
    }
  }

  updateAlt()
  editor.on('selectionUpdate', updateAlt)

  onCleanup(() => {
    editor.off('selectionUpdate', updateAlt)
  })
}, { immediate: true })

watch(active, (isActive) => {
  if (isActive && props.autoOpen) {
    open.value = true
  }
})

function setAlt() {
  if (!props.editor.isActive('image')) return

  const { state } = props.editor
  const { selection } = state
  const pos = selection.from
  const node = state.doc.nodeAt(pos)

  if (node && node.type.name === 'image') {
    props.editor
      .chain()
      .focus()
      .updateAttributes('image', { alt: alt.value || null })
      .run()
  }

  open.value = false
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    setAlt()
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    open.value = false
  }
}
</script>

<template>
  <UPopover
    v-model:open="open"
    :ui="{ content: 'p-0.5' }"
  >
    <UTooltip text="编辑图片描述">
      <UButton
        icon="i-lucide-file-text"
        color="neutral"
        active-color="primary"
        variant="ghost"
        active-variant="soft"
        size="sm"
        :active="active"
        :disabled="disabled"
      />
    </UTooltip>

    <template #content>
      <UInput
        v-model="alt"
        autofocus
        name="alt"
        type="text"
        variant="none"
        placeholder="输入图片描述（alt文本）..."
        @keydown="handleKeyDown"
      >
        <div class="flex items-center mr-0.5">
          <UButton
            icon="i-lucide-corner-down-left"
            variant="ghost"
            size="sm"
            :disabled="!active"
            title="应用"
            @click="setAlt"
          />

          <USeparator
            orientation="vertical"
            class="h-6 mx-1"
          />

          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="sm"
            title="关闭"
            @click="open = false"
          />
        </div>
      </UInput>
    </template>
  </UPopover>
</template>
