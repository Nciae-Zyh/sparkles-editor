<script lang="ts" setup>
import { useSafeLocalePath } from '~/utils/safeLocalePath'

interface Props {
  hideTitle?: boolean
}

withDefaults(defineProps<Props>(), {
  hideTitle: false
})

const safeLocalePath = useSafeLocalePath()

// 定义事件，用于触发文档树的打开/关闭
const emit = defineEmits<{
  toggleDocumentTree: []
}>()

const toggleDocumentTree = () => {
  emit('toggleDocumentTree')
}
</script>

<template>
  <UHeader
    :toggle="false"
    :ui="{
      container: 'px-4 sm:px-6 lg:px-14!',
      right: 'justify-end-safe overflow-x-auto py-2 gap-2'
    }"
  >
    <template
      v-if="!hideTitle"
      #left
    >
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-menu"
          variant="ghost"
          size="sm"
          class="lg:hidden"
          @click="toggleDocumentTree"
        />
        <NuxtLink :to="safeLocalePath('/')">
          <h1 class="font-bold text-lg sm:text-2xl">
            Sparkles
            <span class="text-primary">Editor</span>
          </h1>
        </NuxtLink>
        <UButton
          icon="i-lucide-sidebar"
          variant="ghost"
          size="sm"
          class="hidden lg:flex"
          @click="toggleDocumentTree"
        />
      </div>
    </template>

    <template #right>
      <slot />

      <USeparator
        orientation="vertical"
        class="h-7"
      />

      <div
        role="group"
        class="flex items-center gap-0.5"
      >
        <UColorModeButton size="sm" />
      </div>
    </template>
  </UHeader>
</template>
