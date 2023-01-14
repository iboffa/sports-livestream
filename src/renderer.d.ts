export {}

interface AppStore {
  get: (prop: string) => any;
  set: (prop: string, value: any) => void;
  delete: (prop: string) => void;
}

interface RecordApi {
  start: (options?: any) => void;
  sendChunk: (chunk: ArrayBuffer) => void;
  stop: () => void;
}

declare global {
  interface Window {
    appStore: AppStore
    recordApi: RecordApi
  }
}
