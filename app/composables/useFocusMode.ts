export const useFocusMode = () => {
  const isFocusMode = useState('focusMode', () => false)

  if (import.meta.client) {
    try {
      const stored = localStorage.getItem('editor:focus-mode')
      if (stored !== null) {
        isFocusMode.value = stored === 'true'
      }
    } catch {
      // ignore storage errors
    }

    watch(isFocusMode, (val) => {
      try {
        localStorage.setItem('editor:focus-mode', String(val))
      } catch {
        // ignore storage errors
      }
    })
  }

  const toggleFocusMode = () => {
    isFocusMode.value = !isFocusMode.value
  }

  const exitFocusMode = () => {
    isFocusMode.value = false
  }

  return { isFocusMode, toggleFocusMode, exitFocusMode }
}
