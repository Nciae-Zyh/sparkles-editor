<script lang="ts" setup>
interface Props {
  documentId: string
}

interface Comment {
  id: string
  selected_text: string
  comment: string
  status: string
  created_at: number
  updated_at: number
  user_id: string
  name?: string
  email?: string
  replies: Array<{
    id: string
    comment_id: string
    content: string
    created_at: number
    user_id: string
    name?: string
    email?: string
  }>
}

const props = defineProps<Props>()
const { tm: $tm, t } = useI18n()
const toast = useToast()
const editorData = computed(() => $tm('editor') as Record<string, string> | undefined)

const comments = ref<Comment[]>([])
const loading = ref(false)
const newComment = ref('')
const newSelectedText = ref('')
const submitting = ref(false)
const replyInputs = ref<Record<string, string>>({})
const replyingTo = ref<string | null>(null)

const open = defineModel<boolean>('open', { default: false })

async function fetchComments() {
  if (!props.documentId) return
  try {
    loading.value = true
    const data = await $fetch<{ comments: Comment[] }>(`/api/documents/${props.documentId}/comments`)
    comments.value = data.comments || []
  } catch (e) {
    console.error('Failed to fetch comments:', e)
  } finally {
    loading.value = false
  }
}

async function submitComment() {
  if (!newComment.value.trim()) return
  try {
    submitting.value = true
    await $fetch(`/api/documents/${props.documentId}/comments`, {
      method: 'POST',
      body: {
        comment: newComment.value.trim(),
        selectedText: newSelectedText.value.trim()
      }
    })
    newComment.value = ''
    newSelectedText.value = ''
    await fetchComments()
    toast.add({
      title: editorData.value?.commentAdded || 'Comment added',
      color: 'success',
      icon: 'i-lucide-check-circle-2'
    })
  } catch (e) {
    toast.add({
      title: editorData.value?.commentAddFailed || 'Failed to add comment',
      color: 'error'
    })
  } finally {
    submitting.value = false
  }
}

async function submitReply(commentId: string) {
  const content = replyInputs.value[commentId]?.trim()
  if (!content) return
  try {
    await $fetch(`/api/documents/${props.documentId}/comments/${commentId}/replies`, {
      method: 'POST',
      body: { content }
    })
    replyInputs.value[commentId] = ''
    replyingTo.value = null
    await fetchComments()
  } catch (e) {
    toast.add({
      title: editorData.value?.replyAddFailed || 'Failed to add reply',
      color: 'error'
    })
  }
}

async function deleteComment(commentId: string) {
  if (!confirm(editorData.value?.deleteCommentConfirm || 'Delete this comment?')) return
  try {
    await $fetch(`/api/documents/${props.documentId}/comments/${commentId}`, {
      method: 'DELETE'
    })
    await fetchComments()
    toast.add({
      title: editorData.value?.commentDeleted || 'Comment deleted',
      color: 'success'
    })
  } catch (e) {
    toast.add({
      title: editorData.value?.commentDeleteFailed || 'Failed to delete comment',
      color: 'error'
    })
  }
}

async function resolveComment(commentId: string) {
  try {
    await $fetch(`/api/documents/${props.documentId}/comments/${commentId}/resolve`, {
      method: 'POST',
      body: { resolved: true }
    })
    await fetchComments()
  } catch (e) {
    console.error('Failed to resolve comment:', e)
  }
}

function formatTime(timestamp: number) {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - timestamp
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return new Date(timestamp * 1000).toLocaleDateString()
}

function toggleReply(commentId: string) {
  replyingTo.value = replyingTo.value === commentId ? null : commentId
}

watch(open, (val) => {
  if (val) fetchComments()
})
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="editorData?.comments || 'Comments'"
    :ui="{ content: 'max-w-md' }"
  >
    <template #body>
      <!-- New comment form -->
      <div class="mb-4 pb-4 border-b border-default">
        <UTextarea
          v-model="newComment"
          :placeholder="editorData?.commentPlaceholder || 'Write a comment...'"
          :rows="2"
          class="mb-2"
        />
        <UInput
          v-model="newSelectedText"
          :placeholder="editorData?.selectedTextPlaceholder || 'Selected text (optional)'"
          size="sm"
          class="mb-2"
        />
        <UButton
          size="sm"
          :loading="submitting"
          :disabled="!newComment.trim()"
          @click="submitComment"
        >
          <UIcon name="i-lucide-send" class="size-3.5 mr-1" />
          {{ editorData?.submitComment || 'Submit' }}
        </UButton>
      </div>

      <!-- Comments list -->
      <div v-if="loading" class="space-y-3">
        <USkeleton v-for="i in 3" :key="i" class="h-20 w-full rounded-lg" />
      </div>

      <div v-else-if="comments.length === 0" class="text-center text-dimmed py-10">
        <UIcon name="i-lucide-message-square" class="size-10 mx-auto mb-3 opacity-40" />
        <p class="text-sm">{{ editorData?.noComments || 'No comments yet' }}</p>
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="comment in comments"
          :key="comment.id"
          class="rounded-lg border border-default p-3"
          :class="{ 'opacity-60': comment.status === 'resolved' }"
        >
          <!-- Selected text reference -->
          <div
            v-if="comment.selected_text"
            class="text-xs text-dimmed bg-elevated rounded p-2 mb-2 italic border-l-2 border-primary"
          >
            "{{ comment.selected_text }}"
          </div>

          <!-- Comment body -->
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-sm font-medium">{{ comment.name || comment.email || 'User' }}</span>
                <span class="text-xs text-dimmed">{{ formatTime(comment.created_at) }}</span>
                <span
                  v-if="comment.status === 'resolved'"
                  class="text-xs bg-success/10 text-success px-1.5 py-0.5 rounded"
                >
                  {{ editorData?.resolved || 'Resolved' }}
                </span>
              </div>
              <p class="text-sm">{{ comment.comment }}</p>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <UButton
                v-if="comment.status !== 'resolved'"
                size="xs"
                variant="ghost"
                icon="i-lucide-check"
                @click="resolveComment(comment.id)"
              />
              <UButton
                size="xs"
                variant="ghost"
                icon="i-lucide-reply"
                @click="toggleReply(comment.id)"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                @click="deleteComment(comment.id)"
              />
            </div>
          </div>

          <!-- Replies -->
          <div
            v-if="comment.replies && comment.replies.length > 0"
            class="mt-2 ml-4 space-y-2"
          >
            <div
              v-for="reply in comment.replies"
              :key="reply.id"
              class="text-sm bg-elevated rounded p-2"
            >
              <div class="flex items-center gap-2 mb-0.5">
                <span class="font-medium text-xs">{{ reply.name || reply.email || 'User' }}</span>
                <span class="text-xs text-dimmed">{{ formatTime(reply.created_at) }}</span>
              </div>
              <p>{{ reply.content }}</p>
            </div>
          </div>

          <!-- Reply input -->
          <div
            v-if="replyingTo === comment.id"
            class="mt-2 ml-4 flex gap-2"
          >
            <UInput
              v-model="replyInputs[comment.id]"
              :placeholder="editorData?.replyPlaceholder || 'Write a reply...'"
              size="sm"
              class="flex-1"
              @keyup.enter="submitReply(comment.id)"
            />
            <UButton
              size="xs"
              @click="submitReply(comment.id)"
            >
              {{ editorData?.reply || 'Reply' }}
            </UButton>
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>
