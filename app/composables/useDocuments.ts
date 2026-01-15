import type { Document } from '~/types'

export const useDocuments = () => {
  const documents = ref<Document[]>([])
  const loading = ref(false)

  const fetchDocuments = async () => {
    try {
      loading.value = true
      const data = await $fetch<{ documents: Document[] }>('/api/documents')
      documents.value = data.documents
      return data.documents
    } catch (error) {
      console.error('Failed to fetch documents:', error)
      return []
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
        const data = await $fetch<{ success: boolean; document: Document }>(`/api/documents/${documentId}`, {
          method: 'PUT',
          body: { title, content }
        })
        // 更新本地列表
        const index = documents.value.findIndex(d => d.id === documentId)
        if (index !== -1) {
          documents.value[index] = { ...documents.value[index], ...data.document }
        }
        return data.document
      } else {
        const data = await $fetch<{ success: boolean; document: Document }>('/api/documents', {
          method: 'POST',
          body: { title, content }
        })
        documents.value.unshift(data.document)
        return data.document
      }
    } catch (error: any) {
      throw new Error(error.data?.message || 'Failed to save document')
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
    getDocument,
    saveDocument,
    deleteDocument
  }
}
