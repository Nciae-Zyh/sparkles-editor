<script lang="ts" setup>
import { useAuth } from '~/composables/useAuth'

const editorData = computed(() => $tm('editor') as Record<string, string> | undefined)
const { user, fetchUser, logout } = useAuth()
const router = useRouter()

const authModalOpen = ref(false)
const authMode = ref<'login' | 'register'>('login')

// Default content - only used when Y.js document is empty
const defaultContent = computed(() => {
  return editorData.value?.defaultContent || ''
})

// 使用 defineModel 定义内容，并设置默认值
const content = defineModel<string>('')

// 监听语言变化，更新默认内容
watch(editorData, () => {
  if (!content.value) {
    content.value = defaultContent.value
  }
}, { deep: true })

onMounted(async () => {
  content.value = defaultContent.value
  await fetchUser()
})
</script>

<template>
  <div>
    <AppHeader>
      <template #default>
        <div class="flex items-center gap-2">
          <UButton
            v-if="user"
            :to="'/documents'"
            icon="i-lucide-folder"
            variant="soft"
            size="sm"
          >
            我的文档
          </UButton>
          <UButton
            v-if="user"
            :to="'/documents'"
            icon="i-lucide-user"
            variant="soft"
            size="sm"
          >
            {{ user.name || user.email }}
          </UButton>
          <UButton
            v-if="!user"
            icon="i-lucide-log-in"
            variant="soft"
            size="sm"
            @click="() => { authMode = 'login'; authModalOpen = true }"
          >
            登录
          </UButton>
          <UButton
            v-if="user"
            icon="i-lucide-log-out"
            variant="soft"
            color="red"
            size="sm"
            @click="async () => { await logout(); await router.push('/') }"
          >
            退出
          </UButton>
        </div>
      </template>
    </AppHeader>

    <MarkdownEditor v-model="content" />

    <AuthModal
      v-model:open="authModalOpen"
      :mode="authMode"
    />
  </div>
</template>
