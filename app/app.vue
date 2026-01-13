<script lang="ts" setup>
const { locale, locales } = useI18n()
const route = useRoute()

const appData = computed(() => $tm('app') as Record<string, string> | undefined)

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: () => locale.value
  }
})

const title = computed(() => appData.value?.title || 'Sparkles Editor')
const description = computed(() => appData.value?.description || '')

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  twitterCard: 'summary_large_image'
})

// 添加 i18n SEO 支持

useHead({
  link: computed(() => {
    const currentPath = route.path
    const basePath = currentPath.replace(/^\/(zh|en)/, '') || '/'

    return locales.value.map((loc: { code: string }) => ({
      rel: 'alternate',
      hreflang: loc.code,
      href: loc.code === 'zh' ? basePath : `/en${basePath === '/' ? '' : basePath}`
    })).concat([{
      rel: 'alternate',
      hreflang: 'x-default',
      href: basePath
    }])
  })
})
</script>

<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
