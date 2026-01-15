<script lang="ts" setup>
interface Props {
  hideTitle?: boolean
}

withDefaults(defineProps<Props>(), {
  hideTitle: false
})
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
      <NuxtLink to="/">
        <h1 class="font-bold text-lg sm:text-2xl">
          Sparkles
          <span class="text-primary">Editor</span>
        </h1>
      </NuxtLink>
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
