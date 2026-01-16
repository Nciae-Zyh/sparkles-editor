import { defineStore } from 'pinia'

// 定义通用的回调函数类型
type EventHandler<T = any> = (payload: T) => void

export const useNotificationStore = defineStore('notification', () => {
  // 1. 数据结构优化：
  // 使用 Map<事件名, Set<回调函数>>。
  // 不使用 ref()，因为存储的是逻辑函数，不需要 UI 响应式，避免 Vue 的 Proxy 开销。
  const listeners = new Map<string, Set<EventHandler>>()

  /**
   * 订阅通知
   * @returns 一个用于取消订阅的函数 (Cleanup Function)
   */
  const subscribe = <T = any>(eventName: string, handler: EventHandler<T>) => {
    if (!listeners.has(eventName)) {
      listeners.set(eventName, new Set())
    }
    listeners.get(eventName)!.add(handler)

    // 3. API 优化：直接返回取消订阅的函数，类似 Vue 的 watch 或 React 的 useEffect
    return () => {
      const handlers = listeners.get(eventName)
      if (handlers) {
        handlers.delete(handler)
        // 如果该事件没有监听者了，清理 Key，防止 Map 无限增长
        if (handlers.size === 0) {
          listeners.delete(eventName)
        }
      }
    }
  }

  /**
   * 发送通知
   */
  const publish = <T = any>(eventName: string, payload?: T) => {
    const handlers = listeners.get(eventName)
    if (handlers) {
      // 这里的 handler 是原始函数，没有任何 Proxy 开销
      handlers.forEach((handler) => {
        try {
          handler(payload)
        } catch (error) {
          console.error(`Error in notification handler for "${eventName}":`, error)
        }
      })
    }
  }

  /**
   * 清空所有订阅 (用于登出或重置)
   */
  const clearAll = () => {
    listeners.clear()
  }

  return {
    subscribe,
    publish,
    clearAll
  }
})
