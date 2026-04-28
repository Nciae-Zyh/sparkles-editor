interface TTSOptions {
  voice?: string
  speed?: string
  emotion?: string
  style?: string
}

interface TTSState {
  isPlaying: Ref<boolean>
  isPaused: Ref<boolean>
  isLoading: Ref<boolean>
  currentTime: Ref<number>
  duration: Ref<number>
  error: Ref<string | null>
}

export function useTTS(): TTSState & {
  speak: (text: string, options?: TTSOptions) => Promise<void>
  pause: () => void
  resume: () => void
  stop: () => void
  seek: (time: number) => void
} {
  const { t } = useI18n()
  const isPlaying = ref(false)
  const isPaused = ref(false)
  const isLoading = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  const error = ref<string | null>(null)

  let audio: HTMLAudioElement | null = null
  let audioContext: AudioContext | null = null
  let animFrameId: number | null = null

  const updateTime = () => {
    if (audio) {
      currentTime.value = audio.currentTime
      duration.value = audio.duration || 0
    }
    if (isPlaying.value && !isPaused.value) {
      animFrameId = requestAnimationFrame(updateTime)
    }
  }

  const speak = async (text: string, options: TTSOptions = {}) => {
    if (!text?.trim()) {
      error.value = t('tts.emptyText') || 'No text to read'
      return
    }

    // 停止当前播放
    stop()

    isLoading.value = true
    isPlaying.value = false
    isPaused.value = false
    error.value = null
    currentTime.value = 0
    duration.value = 0

    try {
      // 调用 TTS API
      const response = await $fetch<{
        success: boolean
        audio: string
        format: string
      }>('/api/ai/tts', {
        method: 'POST',
        body: {
          text: text.slice(0, 4000), // 限制文本长度
          voice: options.voice || 'mimo_default',
          speed: options.speed,
          emotion: options.emotion,
          style: options.style
        }
      })

      if (!response.success || !response.audio) {
        throw new Error('TTS request failed')
      }

      // 将 base64 音频数据转换为 Blob
      const audioBytes = Uint8Array.from(atob(response.audio), c => c.charCodeAt(0))
      const audioBlob = new Blob([audioBytes], { type: 'audio/wav' })
      const audioUrl = URL.createObjectURL(audioBlob)

      // 创建 Audio 元素播放
      audio = new Audio(audioUrl)

      audio.onloadedmetadata = () => {
        duration.value = audio?.duration || 0
        isLoading.value = false
        isPlaying.value = true
      }

      audio.onended = () => {
        isPlaying.value = false
        isPaused.value = false
        isLoading.value = false
        currentTime.value = 0
        if (animFrameId) {
          cancelAnimationFrame(animFrameId)
          animFrameId = null
        }
        URL.revokeObjectURL(audioUrl)
      }

      audio.onerror = () => {
        error.value = t('tts.playbackError') || 'Playback error'
        isPlaying.value = false
        isPaused.value = false
        isLoading.value = false
        if (animFrameId) {
          cancelAnimationFrame(animFrameId)
          animFrameId = null
        }
        URL.revokeObjectURL(audioUrl)
      }

      await audio.play()
      updateTime()
    } catch (err: unknown) {
      console.error('TTS error:', err)
      const errorMessage = err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : t('tts.requestError') || 'TTS request failed'
      error.value = errorMessage
      isPlaying.value = false
      isPaused.value = false
      isLoading.value = false
    }
  }

  const pause = () => {
    if (audio && isPlaying.value && !isPaused.value) {
      audio.pause()
      isPaused.value = true
      if (animFrameId) {
        cancelAnimationFrame(animFrameId)
        animFrameId = null
      }
    }
  }

  const resume = () => {
    if (audio && isPaused.value) {
      audio.play()
      isPaused.value = false
      updateTime()
    }
  }

  const stop = () => {
    if (audio) {
      audio.pause()
      audio.currentTime = 0
      audio = null
    }
    if (animFrameId) {
      cancelAnimationFrame(animFrameId)
      animFrameId = null
    }
    isPlaying.value = false
    isPaused.value = false
    isLoading.value = false
    currentTime.value = 0
    duration.value = 0
  }

  const seek = (time: number) => {
    if (audio) {
      audio.currentTime = time
      currentTime.value = time
    }
  }

  // 组件卸载时清理
  onUnmounted(() => {
    stop()
    if (audioContext) {
      audioContext.close()
      audioContext = null
    }
  })

  return {
    isPlaying: readonly(isPlaying),
    isPaused: readonly(isPaused),
    isLoading: readonly(isLoading),
    currentTime: readonly(currentTime),
    duration: readonly(duration),
    error: readonly(error),
    speak,
    pause,
    resume,
    stop,
    seek
  }
}
