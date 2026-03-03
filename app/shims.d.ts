declare module 'vue3-google-signin' {
  import type { Ref } from 'vue'

  export interface ImplicitFlowSuccessResponse {
    code: string
  }

  export interface ImplicitFlowErrorResponse {
    error?: string
    error_description?: string
  }

  export function useCodeClient(options: {
    onSuccess?: (response: ImplicitFlowSuccessResponse) => void | Promise<void>
    onError?: (response: ImplicitFlowErrorResponse) => void
    scope?: string
    client_id: string
  }): {
    isReady: Ref<boolean>
    login: () => void
  }
}

declare global {
  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement
    first<T = unknown>(): Promise<T | null>
    all<T = unknown>(): Promise<{ results?: T[] }>
    run(): Promise<{ success: boolean }>
  }

  interface D1Database {
    prepare(query: string): D1PreparedStatement
  }

  interface R2Bucket {
    get(
      key: string
    ): Promise<{ text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> } | null>
    put(
      key: string,
      value: string | ArrayBuffer | ArrayBufferView | ReadableStream | Blob,
      options?: {
        httpMetadata?: {
          contentType?: string
        }
      }
    ): Promise<void>
    delete(key: string): Promise<void>
  }
}

declare module '@internationalized/date' {
  export type DateValue = CalendarDate | CalendarDateTime

  export class CalendarDate {
    constructor(year: number, month: number, day: number)
    year: number
    month: number
    day: number
    toDateTime(time: { hour: number; minute: number; second: number }): CalendarDateTime
  }

  export class CalendarDateTime {
    constructor(
      year: number,
      month: number,
      day: number,
      hour?: number,
      minute?: number,
      second?: number
    )
    year: number
    month: number
    day: number
    hour: number
    minute: number
    second: number
  }
}

declare module '#app' {
  interface NuxtApp {
    $subscribeNotification?: <T = unknown>(
      eventName: string,
      handler: (payload: T) => void
    ) => () => void
    $publishNotification?: <T = unknown>(eventName: string, payload?: T) => void
    $clearAllSubscribe?: () => void
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $subscribeNotification?: <T = unknown>(
      eventName: string,
      handler: (payload: T) => void
    ) => () => void
    $publishNotification?: <T = unknown>(eventName: string, payload?: T) => void
    $clearAllSubscribe?: () => void
  }
}
