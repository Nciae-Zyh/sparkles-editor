<script lang="ts" setup>
import { useAuth } from '~/composables/useAuth'
import { useSafeLocalePath } from '~/utils/safeLocalePath'

const appData = computed(() => $tm('app') as Record<string, string> | undefined)
const { user, fetchUser, logout } = useAuth()
const router = useRouter()
const route = useRoute()
const safeLocalePath = useSafeLocalePath()

const authModalOpen = ref(false)
const authMode = ref<'login' | 'register'>('login')

// 新建文档函数
const createNewDocument = () => {
  const homePath = safeLocalePath('/')
  // 如果已经在首页，使用 replace 避免历史记录堆积
  if (route.path === homePath || route.path === '/') {
    router.replace({ path: homePath, query: { function: 'create' } })
  } else {
    router.push({ path: homePath, query: { function: 'create' } })
  }
}

onMounted(async () => {
  await fetchUser()
})
</script>

<template>
  <div>
    <AppHeader>
      <div class="flex items-center gap-2">
        <UTooltip
          v-if="user && (appData?.newDocument || '新建文档').length > 10"
          :text="appData?.newDocument || '新建文档'"
        >
          <UButton
            icon="i-lucide-file-plus"
            variant="soft"
            size="sm"
            @click="createNewDocument"
          />
        </UTooltip>
        <UButton
          v-else-if="user"
          icon="i-lucide-file-plus"
          variant="soft"
          size="sm"
          @click="createNewDocument"
        >
          {{ appData?.newDocument || '新建文档' }}
        </UButton>
        <UTooltip
          v-if="user && (appData?.myDocuments || '我的文档').length > 10"
          :text="appData?.myDocuments || '我的文档'"
        >
          <UButton
            :to="safeLocalePath('/documents')"
            icon="i-lucide-folder"
            variant="soft"
            size="sm"
          />
        </UTooltip>
          <UButton
            v-else-if="user"
            :to="safeLocalePath('/documents')"
            icon="i-lucide-folder"
            variant="soft"
            size="sm"
          >
            {{ appData?.myDocuments || '我的文档' }}
          </UButton>
          <UButton
            v-if="user"
            :to="safeLocalePath('/documents')"
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
            {{ appData?.login || '登录' }}
          </UButton>
          <UButton
            v-if="user"
            icon="i-lucide-log-out"
            variant="soft"
            color="error"
            size="sm"
            @click="async () => { await logout(); await router.push(safeLocalePath('/')) }"
          >
            {{ appData?.logout || '退出' }}
          </UButton>
      </div>
    </AppHeader>

    <slot />

    <AuthModal
      v-model:open="authModalOpen"
      :mode="authMode"
    />
  </div>
</template>
