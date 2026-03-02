import type { Document } from '~/types'

interface ApiErrorLike {
  statusCode?: number
  status?: number
  message?: string
  data?: {
    message?: string
  }
}

export const useDocuments = () => {
  const { t } = useI18n()
  const documents = ref<Document[]>([])
  const loading = ref(false)

  const getErrorInfo = (error: unknown): ApiErrorLike => {
    if (!error || typeof error !== 'object') {
      return {}
    }
    return error as ApiErrorLike
  }

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
    } catch (error: unknown) {
      const errorInfo = getErrorInfo(error)
      throw new Error(errorInfo.data?.message || t('documents.createFolderFailed'))
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
    } catch (error: unknown) {
      const errorInfo = getErrorInfo(error)
      throw new Error(errorInfo.data?.message || t('documents.createDocumentFailed'))
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
        } catch (error: unknown) {
          const errorInfo = getErrorInfo(error)
          if (errorInfo.statusCode === 404 || errorInfo.status === 404) {
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
    } catch (error: unknown) {
      const errorInfo = getErrorInfo(error)
      let errorMessage = t('actions.saveFailed')
      if (errorInfo.data?.message) {
        errorMessage = errorInfo.data.message
      } else if (errorInfo.message) {
        errorMessage = errorInfo.message
      } else if (errorInfo.statusCode === 500) {
        errorMessage = t('actions.serverError')
      } else if (errorInfo.statusCode === 401) {
        errorMessage = t('actions.pleaseLogin')
      } else if (errorInfo.statusCode === 400) {
        errorMessage = t('actions.invalidRequest')
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
    } catch (error: unknown) {
      const errorInfo = getErrorInfo(error)
      throw new Error(errorInfo.data?.message || t('documents.deleteFailed'))
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
    } catch (error: unknown) {
      const errorInfo = getErrorInfo(error)
      throw new Error(errorInfo.data?.message || errorInfo.message || t('documents.renameFailedRetry'))
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
    } catch (error: unknown) {
      const errorInfo = getErrorInfo(error)
      console.error('[useDocuments] 移动文档失败:', {
        message: errorInfo.message,
        statusCode: errorInfo.statusCode,
        data: errorInfo.data
      })
      throw new Error(errorInfo.data?.message || errorInfo.message || t('documents.moveFailed'))
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

  const toggleFavorite = async (id: string, isFavorite?: boolean) => {
    const data = await $fetch<{ is_favorite: number }>(`/api/documents/${id}/favorite`, {
      method: 'POST',
      body: typeof isFavorite === 'boolean' ? { isFavorite } : {}
    })
    return data.is_favorite
  }

  const togglePin = async (id: string, isPinned?: boolean) => {
    const data = await $fetch<{ is_pinned: number }>(`/api/documents/${id}/pin`, {
      method: 'POST',
      body: typeof isPinned === 'boolean' ? { isPinned } : {}
    })
    return data.is_pinned
  }

  const updateTags = async (id: string, tags: string[]) => {
    const data = await $fetch<{ tags: string[] }>(`/api/documents/${id}/tags`, {
      method: 'PUT',
      body: { tags }
    })
    return data.tags
  }

  const fetchTrash = async () => {
    const data = await $fetch<{ items: Document[] }>('/api/documents/trash')
    return data.items || []
  }

  const restoreDocument = async (id: string, parentId?: string | null) => {
    await $fetch(`/api/documents/${id}/restore`, {
      method: 'POST',
      body: { parentId }
    })
  }

  const permanentDeleteDocument = async (id: string) => {
    await $fetch(`/api/documents/${id}/permanent-delete`, { method: 'DELETE' })
  }

  const emptyTrash = async () => {
    await $fetch('/api/documents/trash', { method: 'DELETE' })
  }

  const searchDocuments = async (q: string, tag?: string) => {
    const data = await $fetch<{ items: Document[] }>('/api/documents/search', {
      params: { q, tag }
    })
    return data.items || []
  }

  const fetchRecentDocuments = async () => {
    const data = await $fetch<{ items: Document[] }>('/api/documents/recent')
    return data.items || []
  }

  const fetchVersions = async (id: string) => {
    const data = await $fetch<{ versions: unknown[] }>(`/api/documents/${id}/versions`)
    return data.versions || []
  }

  const createVersion = async (id: string, content?: string, title?: string) => {
    const data = await $fetch<{ version: unknown }>(`/api/documents/${id}/versions`, {
      method: 'POST',
      body: { content, title }
    })
    return data.version
  }

  const restoreVersion = async (id: string, versionId: string) => {
    return await $fetch<{ document: Document }>(`/api/documents/${id}/versions/${versionId}/restore`, {
      method: 'POST'
    })
  }

  const fetchComments = async (id: string) => {
    const data = await $fetch<{ comments: unknown[] }>(`/api/documents/${id}/comments`)
    return data.comments || []
  }

  const createComment = async (id: string, comment: string, selectedText = '') => {
    const data = await $fetch<{ comment: unknown }>(`/api/documents/${id}/comments`, {
      method: 'POST',
      body: { comment, selectedText }
    })
    return data.comment
  }

  const addCommentReply = async (id: string, commentId: string, content: string) => {
    const data = await $fetch<{ reply: unknown }>(`/api/documents/${id}/comments/${commentId}/replies`, {
      method: 'POST',
      body: { content }
    })
    return data.reply
  }

  const resolveComment = async (id: string, commentId: string, resolved = true) => {
    const data = await $fetch<{ status: string }>(`/api/documents/${id}/comments/${commentId}/resolve`, {
      method: 'POST',
      body: { resolved }
    })
    return data.status
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
    moveDocument,
    toggleFavorite,
    togglePin,
    updateTags,
    fetchTrash,
    restoreDocument,
    permanentDeleteDocument,
    emptyTrash,
    searchDocuments,
    fetchRecentDocuments,
    fetchVersions,
    createVersion,
    restoreVersion,
    fetchComments,
    createComment,
    addCommentReply,
    resolveComment
  }
}
