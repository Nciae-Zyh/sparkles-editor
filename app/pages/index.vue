<script lang="ts" setup>
import { useAuth } from '~/composables/useAuth'

const editorData = computed(() => $tm('editor') as Record<string, string> | undefined)
const { user, fetchUser, logout } = useAuth()
const router = useRouter()
const route = useRoute()

const authModalOpen = ref(false)
const authMode = ref<'login' | 'register'>('login')

// Default content - only used when Y.js document is empty
const defaultContent = computed(() => {
  return editorData.value?.defaultContent || ''
})

// 使用 ref 定义内容，并设置默认值
const content = ref<string>('')
const isNewDocument = ref(false) // 首页默认是预览模式
const allowSave = ref(false) // 是否允许保存

// 新建文档函数 - 进入可保存的新建模式
const createNewDocument = () => {
  content.value = ''
  isNewDocument.value = true
  allowSave.value = true // 允许保存
  // 如果已经在首页，不需要路由跳转
  if (route.path !== '/') {
    router.push('/')
  }
}

// 监听语言变化，更新默认内容
watch(editorData, () => {
  if (!content.value && !isNewDocument.value) {
    content.value = defaultContent.value
  }
}, { deep: true })

onMounted(async () => {
  if (!content.value) {
    content.value = defaultContent.value
  }
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
            icon="i-lucide-file-plus"
            variant="soft"
            size="sm"
            @click="createNewDocument"
          >
            新建文档
          </UButton>
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
            color="error"
            size="sm"
            @click="async () => { await logout(); await router.push('/') }"
          >
            退出
          </UButton>
        </div>
      </template>
    </AppHeader>

    <MarkdownEditor
      v-model="content"
      :enable-before-unload="false"
      :readonly="!allowSave"
      :allow-save="allowSave"
      @document-saved="(id) => {
        isNewDocument = false
        allowSave.value = false // 保存后恢复预览模式
      }"
    />

    <AuthModal
      v-model:open="authModalOpen"
      :mode="authMode"
    />
  </div>
</template>
