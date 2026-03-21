<script lang="ts" setup>
interface Props {
  availableTags?: string[]
  placeholder?: string
  maxTags?: number
}

const props = withDefaults(defineProps<Props>(), {
  availableTags: () => [],
  placeholder: '',
  maxTags: 12
})

const model = defineModel<string[]>({ default: () => [] })
const { tm: $tm, t } = useI18n()
const editorData = computed(() => $tm('editor') as Record<string, string> | undefined)

const inputValue = ref('')
const showSuggestions = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

// 过滤可用标签（排除已选择的）
const filteredSuggestions = computed(() => {
  const input = inputValue.value.trim().toLowerCase()
  if (!input) return []
  return props.availableTags
    .filter((tag: string) => !model.value.includes(tag) && tag.toLowerCase().includes(input))
    .slice(0, 8)
})

function addTag(tag: string) {
  const trimmed = tag.trim().toLowerCase()
  if (!trimmed) return
  if (model.value.length >= props.maxTags) return
  if (model.value.includes(trimmed)) return
  model.value = [...model.value, trimmed]
  inputValue.value = ''
  showSuggestions.value = false
}

function removeTag(index: number) {
  model.value = model.value.filter((_: string, i: number) => i !== index)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    if (inputValue.value.trim()) {
      // 支持逗号分隔批量添加
      const tags = inputValue.value.split(',').map(t => t.trim()).filter(Boolean)
      tags.forEach(tag => addTag(tag))
    }
  } else if (e.key === 'Backspace' && !inputValue.value && model.value.length > 0) {
    removeTag(model.value.length - 1)
  } else if (e.key === 'Escape') {
    showSuggestions.value = false
  }
}

function selectSuggestion(tag: string) {
  addTag(tag)
  inputRef.value?.focus()
}

function handleInput() {
  showSuggestions.value = inputValue.value.trim().length > 0
}

const placeholderText = computed(() => {
  return props.placeholder || editorData.value?.tagInputPlaceholder || t('editor.tagInputPlaceholder')
})
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5 p-1.5 border border-default rounded-lg bg-default focus-within:border-primary transition-colors">
    <UBadge
      v-for="(tag, i) in model"
      :key="tag"
      variant="soft"
      color="primary"
      size="sm"
      class="cursor-pointer"
      @click="removeTag(i)"
    >
      {{ tag }}
      <UIcon
        name="i-lucide-x"
        class="size-3 ml-1"
      />
    </UBadge>
    <div class="relative flex-1 min-w-[120px]">
      <input
        ref="inputRef"
        v-model="inputValue"
        :placeholder="model.length === 0 ? placeholderText : ''"
        class="w-full bg-transparent border-none outline-none text-sm text-default placeholder:text-dimmed"
        @keydown="handleKeydown"
        @input="handleInput"
        @focus="showSuggestions = inputValue.trim().length > 0"
        @blur="setTimeout(() => showSuggestions.value = false, 200)"
      >
      <!-- 自动补全下拉 -->
      <div
        v-if="showSuggestions && filteredSuggestions.length > 0"
        class="absolute top-full left-0 right-0 mt-1 bg-elevated border border-default rounded-lg shadow-lg z-50 overflow-hidden"
      >
        <button
          v-for="tag in filteredSuggestions"
          :key="tag"
          class="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          @mousedown.prevent="selectSuggestion(tag)"
        >
          {{ tag }}
        </button>
      </div>
    </div>
  </div>
</template>
