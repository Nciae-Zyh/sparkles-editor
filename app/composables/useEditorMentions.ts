import type { EditorMentionMenuItem } from '@nuxt/ui'

const FALLBACK_USERS = [{
  label: 'benjamincanac',
  avatar: { src: 'https://avatars.githubusercontent.com/u/739984?v=4' }
}, {
  label: 'atinux',
  avatar: { src: 'https://avatars.githubusercontent.com/u/904724?v=4' }
}, {
  label: 'HugoRCD',
  avatar: { src: 'https://avatars.githubusercontent.com/u/71938701?v=4' }
}]

export function useEditorMentions() {
  const items = computed<EditorMentionMenuItem[]>(() => {
    return FALLBACK_USERS
  })

  return {
    items
  }
}
