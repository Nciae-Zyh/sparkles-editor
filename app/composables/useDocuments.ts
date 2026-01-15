import type { Document } from '~/types'

export const useDocuments = () => {
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

  const saveDocument = async (title: string, content: string, documentId?: string, parentId?: string) => {
    try {
      loading.value = true
      console.log('[useDocuments] 开始保存文档:', {
        documentId,
        title,
        contentLength: content?.length || 0,
        parentId
      })

      if (documentId) {
        console.log('[useDocuments] 更新现有文档:', documentId)
        const data = await $fetch<{ success: boolean, document: Document }>(`/api/documents/${documentId}`, {
          method: 'PUT',
          body: { title, content, parentId }
        })
        console.log('[useDocuments] 文档更新成功:', data.document.id)
        // 更新本地列表
        const index = documents.value.findIndex(d => d.id === documentId)
        if (index !== -1) {
          documents.value[index] = { ...documents.value[index], ...data.document }
        }
        return data.document
      } else {
        console.log('[useDocuments] 创建新文档')
        const data = await $fetch<{ success: boolean, document: Document }>('/api/documents', {
          method: 'POST',
          body: { title, content, parentId, type: 'document' }
        })
        console.log('[useDocuments] 文档创建成功:', data.document.id)
        documents.value.unshift(data.document)
        return data.document
      }
    } catch (error: any) {
      console.error('[useDocuments] 保存文档失败:', {
        message: error?.message,
        statusCode: error?.statusCode,
        data: error?.data,
        response: error?.response,
        error: error
      })

      // 提取更详细的错误信息
      let errorMessage = '保存文档失败'
      if (error?.data?.message) {
        errorMessage = error.data.message
      } else if (error?.message) {
        errorMessage = error.message
      } else if (error?.statusCode === 500) {
        errorMessage = '服务器内部错误，请稍后重试'
      } else if (error?.statusCode === 401) {
        errorMessage = '请先登录'
      } else if (error?.statusCode === 400) {
        errorMessage = '请求参数错误'
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

  return {
    documents: readonly(documents),
    loading: readonly(loading),
    fetchDocuments,
    fetchFolders,
    getDocument,
    saveDocument,
    deleteDocument,
    createFolder
  }
}
