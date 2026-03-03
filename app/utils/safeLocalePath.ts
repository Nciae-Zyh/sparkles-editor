/**
 * 安全的 localePath，如果当前语言的路由不存在，回退到英文版本
 * @param path 路由路径
 * @param targetLocale 可选的目标语言代码，如果不提供则使用当前语言
 * @returns 本地化的路由路径，如果不存在则返回英文版本
 */
export const useSafeLocalePath = () => {
  const localePath = useLocalePath()
  const { locale, defaultLocale } = useI18n()
  type LocaleCode = 'en' | 'zh'

  return (path: string, targetLocale?: LocaleCode): string => {
    // 如果指定了目标语言，直接使用
    if (targetLocale) {
      return localePath(path, targetLocale)
    }

    // 如果当前语言是默认语言，直接返回
    const fallbackLocale = (defaultLocale as LocaleCode | undefined) || 'en'
    if (locale.value === fallbackLocale) {
      return localePath(path)
    }

    // 获取当前语言和英文版本的路由
    const currentLocalePath = localePath(path)
    const fallbackPath = localePath(path, fallbackLocale)

    // 检查当前语言的路由是否存在
    try {
      if (currentLocalePath.length) {
        return currentLocalePath
      } else {
        return fallbackPath
      }
    } catch {
      // 如果解析失败，使用英文版本
      return fallbackPath
    }
  }
}
