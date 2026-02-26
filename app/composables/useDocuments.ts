import type { Document } from '~/types'

export const useDocuments = () => {
  const { t } = useI18n()
  const documents = ref<Document[]>([])
  const loading = ref(false)

  const fetchDocuments = async (parentId?: string) => {
    try {
      loading.value = true
      const params = parentId ? { parentId } : {}
      const data = await $fetch<{ documents: Document[] }>('/api/documents', { params })
      documents.value = data.documents
      return data.documents
    } catch (error) {
      console.error('Failed to fetch documents:', error)
      return []
    } finally {
      loading.value = false
    }
  }

  const fetchFolders = async () => {
    try {
      const data = await $fetch<{ folders: Document[] }>('/api/folders')
      return data.folders
    } catch (error) {
      console.error('Failed to fetch folders:', error)
      return []
    }
  }

  const fetchDocumentTree = async () => {
    try {
      loading.value = true
      const data = await $fetch<{ tree: Document[], flat: Document[] }>('/api/documents/tree')
      return data
    } catch (error) {
      console.error('Failed to fetch document tree:', error)
      return { tree: [], flat: [] }
    } finally {
      loading.value = false
    }
  }

  const createFolder = async (title: string, parentId?: string) => {
    try {
      loading.value = true
      const data = await $fetch<{ success: boolean, folder: Document }>('/api/folders', {
        method: 'POST',
        body: { title, parentId }
      })
      documents.value.unshift(data.folder)
      return data.folder
    } catch (error: any) {
      throw new Error(error.data?.message || 'Failed to create folder')
    } finally {
      loading.value = false
    }
  }

  const createEmptyDocument = async (title: string, parentId?: string) => {
    try {
      loading.value = true
      const data = await $fetch<{ success: boolean, document: Document }>('/api/documents', {
        method: 'POST',
        body: { title, content: '', type: 'document', parentId }
      })
      documents.value.unshift(data.document)
      return data.document
    } catch (error: any) {
      throw new Error(error.data?.message || 'Failed to create document')
    } finally {
      loading.value = false
    }
  }

  const getDocument = async (id: string) => {
    try {
      loading.value = true
      const data = await $fetch<{ document: Document & { content?: string } }>(`/api/documents/${id}`)
      return data.document
    } catch (error) {
      console.error('Failed to fetch document:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  const saveDocument = async (title: string, content: string, documentId?: string) => {
    try {
      loading.value = true

      if (documentId) {
        // 直接尝试 PUT，若文档不存在（404）再 fallback 到 POST（携带自定义 ID）
        try {
          const data = await $fetch<{ success: boolean, document: Document }>(`/api/documents/${documentId}`, {
            method: 'PUT',
            body: { title, content }
          })
          const index = documents.value.findIndex(d => d.id === documentId)
          if (index !== -1) {
            documents.value[index] = { ...documents.value[index], ...data.document }
          }
          return data.document
        } catch (error: any) {
          if (error?.statusCode === 404 || error?.status === 404) {
            const data = await $fetch<{ success: boolean, document: Document }>('/api/documents', {
              method: 'POST',
              body: { title, content, type: 'document', id: documentId }
            })
            documents.value.unshift(data.document)
            return data.document
          }
          throw error
        }
      } else {
        const data = await $fetch<{ success: boolean, document: Document }>('/api/documents', {
          method: 'POST',
          body: { title, content, type: 'document' }
        })
        documents.value.unshift(data.document)
        return data.document
      }
    } catch (error: any) {
      let errorMessage = t('actions.saveFailed') || '保存文档失败'
      if (error?.data?.message) {
        errorMessage = error.data.message
      } else if (error?.message) {
        errorMessage = error.message
      } else if (error?.statusCode === 500) {
        errorMessage = t('actions.serverError') || '服务器内部错误，请稍后重试'
      } else if (error?.statusCode === 401) {
        errorMessage = t('actions.pleaseLogin') || '请先登录'
      } else if (error?.statusCode === 400) {
        errorMessage = t('actions.invalidRequest') || '请求参数错误'
      }

      throw new Error(errorMessage)
    } finally {
      loading.value = false
    }
  }

  const deleteDocument = async (id: string) => {
    try {
      loading.value = true
      await $fetch(`/api/documents/${id}`, {
        method: 'DELETE'
      })
      documents.value = documents.value.filter(d => d.id !== id)
    } catch (error: any) {
      throw new Error(error.data?.message || 'Failed to delete document')
    } finally {
      loading.value = false
    }
  }

  const renameDocument = async (id: string, newTitle: string) => {
    try {
      loading.value = true
      // 服务端已修复：不传 content 时不会覆盖 R2 内容，无需先 GET
      const data = await $fetch<{ success: boolean, document: Document }>(`/api/documents/${id}`, {
        method: 'PUT',
        body: { title: newTitle }
      })
      const index = documents.value.findIndex(d => d.id === id)
      if (index !== -1) {
        documents.value[index] = { ...documents.value[index], ...data.document }
      }
      return data.document
    } catch (error: any) {
      throw new Error(error.data?.message || error.message || '重命名文档失败')
    } finally {
      loading.value = false
    }
  }

  const moveDocument = async (id: string, parentId: string | null) => {
    try {
      loading.value = true
      const data = await $fetch<{ success: boolean, document: Partial<Document> }>(`/api/documents/${id}/move`, {
        method: 'POST',
        body: { parentId }
      })
      // 更新本地列表
      const index = documents.value.findIndex(d => d.id === id)
      if (index !== -1 && data.document) {
        documents.value[index] = { ...documents.value[index], ...data.document }
      }
      return data.document
    } catch (error: any) {
      console.error('[useDocuments] 移动文档失败:', {
        message: error?.message,
        statusCode: error?.statusCode,
        data: error?.data
      })
      throw new Error(error.data?.message || error.message || '移动文档失败')
    } finally {
      loading.value = false
    }
  }

  const fetchFolderChildren = async (folderId: string) => {
    try {
      loading.value = true
      const data = await $fetch<{ children: Document[] }>(`/api/documents/folder/${folderId}/children`)
      return data.children
    } catch (error) {
      console.error('Failed to fetch folder children:', error)
      return []
    } finally {
      loading.value = false
    }
  }

  return {
    documents: readonly(documents),
    loading: readonly(loading),
    fetchDocuments,
    fetchFolders,
    fetchDocumentTree,
    fetchFolderChildren,
    getDocument,
    saveDocument,
    deleteDocument,
    createFolder,
    createEmptyDocument,
    renameDocument,
    moveDocument
  }
}
