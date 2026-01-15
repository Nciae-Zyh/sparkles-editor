<script setup lang="ts">
import type { NodeViewProps } from '@tiptap/vue-3'
import { NodeViewWrapper } from '@tiptap/vue-3'

const props = defineProps<NodeViewProps>()

const imageData = computed(() => $tm('image') as Record<string, string> | undefined)

const fileUploadRef = useTemplateRef('fileUploadRef')

const error = ref<string | null>(null)
const loading = ref(false)
const showAltDialog = ref(false)
const imageSrc = ref<string>('')
const imageAlt = ref('')

const upload = useUpload('/api/upload', {
  formKey: 'file',
  multiple: false
})

async function onFileChange() {
  const target = fileUploadRef.value?.inputRef
  console.log(target)
  if (!target) {
    return
  }

  loading.value = true
  error.value = null

  try {
    const result = await upload(target)
    console.log(result)
    imageSrc.value = result.url || `/images/${result.pathname}`
    console.log(imageSrc.value)
    imageAlt.value = ''
    showAltDialog.value = true
  } catch (e) {
    console.log(e)
    error.value = (e as Error & { data: { message: string } }).data.message || '上传失败'
  } finally {
    loading.value = false
  }
}

function confirmImage() {
  const pos = props.getPos()
  if (typeof pos !== 'number') {
    return
  }

  props.editor
    .chain()
    .focus()
    .deleteRange({ from: pos, to: pos + 1 })
    .setImage({
      src: imageSrc.value,
      alt: imageAlt.value || ''
    })
    .run()

  showAltDialog.value = false
  imageSrc.value = ''
  imageAlt.value = ''
}

function cancelImage() {
  showAltDialog.value = false
  imageSrc.value = ''
  imageAlt.value = ''
}
</script>

<template>
  <NodeViewWrapper>
    <UFileUpload
      ref="fileUploadRef"
      accept="image/*"
      :label="imageData?.upload"
      :description="error || imageData?.uploadDescription"
      :preview="false"
      class="min-h-48"
      :ui="{ description: error ? 'text-error' : '' }"
      @update:model-value="onFileChange"
    >
      <template #leading>
        <UAvatar
          :icon="error ? 'i-lucide-alert-circle' : loading ? 'i-lucide-loader-circle' : 'i-lucide-image'"
          size="xl"
          :ui="{ icon: [loading && 'animate-spin', error && 'text-error'] }"
        />
      </template>
    </UFileUpload>

    <UModal
      v-model:open="showAltDialog"
      :title="imageData?.setAlt"
      :ui="{ footer: 'justify-end', content: 'sm:max-w-md' }"
    >
      <template #body>
        <div class="space-y-4">
          <div class="flex justify-center">
            <img
              :src="imageSrc"
              :alt="imageData?.preview"
              class="w-full rounded-lg object-contain max-h-64 border border-gray-200 dark:border-gray-800"
            >
          </div>
          <UInput
            v-model="imageAlt"
            class="w-full"
            :label="imageData?.altLabel"
            :placeholder="imageData?.altPlaceholder"
            autofocus
            @keydown.enter="confirmImage"
          />
        </div>
      </template>

      <template #footer="{ close }">
        <UButton
          color="neutral"
          variant="ghost"
          :label="imageData?.cancel"
          @click="cancelImage"
        />
        <UButton
          color="primary"
          :label="imageData?.confirm"
          @click="confirmImage"
        />
      </template>
    </UModal>
  </NodeViewWrapper>
</template>
