export function useBeforeUnload(enabled: Ref<boolean> | (() => boolean) = () => true) {
  const { tm: $tm, t } = useNuxtApp().$i18n as { tm: (key: string) => unknown, t: (key: string, ...args: unknown[]) => string }
  const beforeunloadData = computed(() => $tm('beforeunload') as Record<string, string> | undefined)

  const isEnabled = computed(() => {
    return typeof enabled === 'function' ? enabled() : enabled.value
  })

  onMounted(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isEnabled.value) {
        return
      }

      // 现代浏览器会忽略自定义消息，但仍需要设置 returnValue
      e.preventDefault()
      const message = beforeunloadData.value?.message || t('beforeunload.message')
      e.returnValue = message
      return message
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    onUnmounted(() => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    })
  })
}
