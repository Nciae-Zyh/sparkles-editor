<script lang="ts" setup>
import { useDocuments } from '~/composables/useDocuments'
import type { Document } from '~/types'

interface Props {
  modelValue?: string
  label?: string
}

const documentsData = computed(() => $tm('documents') as Record<string, string> | undefined)

const props = withDefaults(defineProps<Props>(), {
  label: undefined
})

const labelText = computed(() => props.label || documentsData.value?.saveLocation || '保存位置')

const emit = defineEmits<{
  'update:modelValue': [value: string | undefined]
}>()

const { fetchFolders } = useDocuments()
const folders = ref<Document[]>([])
const loading = ref(false)

const selectedValue = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value)
})

// 构建文件夹树形结构用于显示
const buildFolderTree = (folders: Document[]): Array<Document & { level: number, displayName: string }> => {
  const result: Array<Document & { level: number, displayName: string }> = []

  // 添加根目录选项
  const rootDirectoryName = documentsData.value?.rootDirectory || '根目录'
  result.push({
    id: '',
    user_id: '',
    title: rootDirectoryName,
    path: '/',
    type: 'folder',
    r2_key: '',
    created_at: 0,
    updated_at: 0,
    level: 0,
    displayName: rootDirectoryName
  } as any)

  // 按路径排序，构建层级显示
  const sortedFolders = [...folders].sort((a, b) => a.path.localeCompare(b.path))

  for (const folder of sortedFolders) {
    const pathParts = folder.path.split('/').filter(Boolean)
    const indent = '  '.repeat(pathParts.length - 1)
    result.push({
      ...folder,
      level: pathParts.length - 1,
      displayName: `${indent}${folder.title}`
    } as any)
  }

  return result
}

const folderOptions = computed(() => {
  return buildFolderTree(folders.value).map(folder => ({
    label: folder.displayName,
    value: folder.id || undefined
  }))
})

onMounted(async () => {
  try {
    loading.value = true
    folders.value = await fetchFolders()
  } catch (error) {
    console.error('Failed to load folders:', error)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <UFormField
    :label="labelText"
    name="parentId"
  >
    <USelect
      v-model="selectedValue"
      :options="folderOptions"
      :loading="loading"
      :placeholder="documentsData?.selectFolder || '选择文件夹（可选，默认保存到根目录）'"
      searchable
    />
  </UFormField>
</template>
