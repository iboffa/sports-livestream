export {}

interface AppStore {
  get: (prop: string) => any;
  set: (prop: string, value: any) => void;
  delete: (prop: string) => void;
}

interface RecordStartResult {
  ok: boolean;
  error?: string;
}

interface RecordApi {
  /** Resolves once ffmpeg has either started or failed to start. */
  start: () => Promise<RecordStartResult>;
  sendChunk: (chunk: ArrayBuffer) => void;
  stop: () => void;
}

declare global {
  interface Window {
    appStore: AppStore
    recordApi: RecordApi
  }
}
