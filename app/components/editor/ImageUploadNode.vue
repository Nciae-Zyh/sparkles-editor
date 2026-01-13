<script setup lang="ts">
import type { NodeViewProps } from '@tiptap/vue-3'
import { NodeViewWrapper } from '@tiptap/vue-3'

const props = defineProps<NodeViewProps>()

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
    error.value = (e as Error & { data: { message: string } }).data.message || 'An unknown error occurred'
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
      label="Upload an image"
      :description="error || 'SVG, PNG, JPG or GIF (max. 2MB)'"
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
      :ui="{ width: 'sm:max-w-md' }"
      @close="cancelImage"
    >
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-base font-semibold leading-6 text-gray-900 dark:text-white">
                设置图片描述
              </h3>
              <UButton
                color="gray"
                variant="ghost"
                icon="i-lucide-x"
                class="-my-1"
                @click="cancelImage"
              />
            </div>
          </template>

          <div class="space-y-4">
            <div class="flex justify-center">
              <img
                :src="imageSrc"
                alt="预览"
                class="w-full rounded-lg object-contain max-h-64 border border-gray-200 dark:border-gray-800"
              >
            </div>
            <UInput
              v-model="imageAlt"
              class="w-full"
              label="图片描述（Alt文本）"
              placeholder="输入图片描述，用于无障碍访问..."
              autofocus
              @keydown.enter="confirmImage"
            />
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="gray"
                variant="ghost"
                label="取消"
                @click="cancelImage"
              />
              <UButton
                color="primary"
                label="确认"
                @click="confirmImage"
              />
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </NodeViewWrapper>
</template>
