import { merge } from 'lodash-es'

import enActions from './locales/en/actions.json'
import enApp from './locales/en/app.json'
import enAuth from './locales/en/auth.json'
import enBeforeunload from './locales/en/beforeunload.json'
import enDocuments from './locales/en/documents.json'
import enDragHandle from './locales/en/dragHandle.json'
import enEditor from './locales/en/editor.json'
import enImage from './locales/en/image.json'
import enLink from './locales/en/link.json'
import enSuggestions from './locales/en/suggestions.json'
import enToolbar from './locales/en/toolbar.json'
import zhActions from './locales/zh/actions.json'
import zhApp from './locales/zh/app.json'
import zhAuth from './locales/zh/auth.json'
import zhBeforeunload from './locales/zh/beforeunload.json'
import zhDocuments from './locales/zh/documents.json'
import zhDragHandle from './locales/zh/dragHandle.json'
import zhEditor from './locales/zh/editor.json'
import zhImage from './locales/zh/image.json'
import zhLink from './locales/zh/link.json'
import zhSuggestions from './locales/zh/suggestions.json'
import zhToolbar from './locales/zh/toolbar.json'

// 自定义合并函数，用于递归地将文件数组合并到对应的语言键下
const mergeAllLanguage = (arr: any[], language?: string) => {
  const temp = {}

  if (language) {
    arr.forEach((item) => {
      const itemTemp = {}
      itemTemp[language] = item
      merge(temp, itemTemp)
    })
  } else {
    arr.forEach((item) => {
      merge(temp, item)
    })
  }
  return temp
}

/**
 * 导出包含所有语言模块变量名数组的对象。
 * 用于运行时动态合并。
 */
const LanguageModuleArrays = {
  en: [enActions, enApp, enAuth, enBeforeunload, enDocuments, enDragHandle, enEditor, enImage, enLink, enSuggestions, enToolbar] as const,
  zh: [zhActions, zhApp, zhAuth, zhBeforeunload, zhDocuments, zhDragHandle, zhEditor, zhImage, zhLink, zhSuggestions, zhToolbar] as const
} as const

// 动态构建最终的 messages 对象
const messages = mergeAllLanguage(
  Object.keys(LanguageModuleArrays).map((key: string) => {
    return mergeAllLanguage(LanguageModuleArrays[key as keyof typeof LanguageModuleArrays], key)
  })
)

export default defineI18nConfig(() => ({
  legacy: false,
  locale: 'zh',
  fallbackLocale: 'en',
  messages: messages
}))
