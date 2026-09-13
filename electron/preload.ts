import { contextBridge, ipcRenderer } from 'electron';
import { START, STOP, VIDEO_CHUNK } from './ffmpeg-runner/messages';

contextBridge.exposeInMainWorld('appStore', {
    get: (prop: string) => ipcRenderer.sendSync('store:get', prop),
    set: (prop: string, value: any) => ipcRenderer.send('store:set', prop, value),
    delete: (prop: string) => ipcRenderer.send('store:delete', prop)
});

contextBridge.exposeInMainWorld('recordApi', {
  // invoke, not send: the renderer needs to know whether ffmpeg actually started
  start: () => ipcRenderer.invoke(START),
  sendChunk: (chunk: ArrayBuffer) => ipcRenderer.send(VIDEO_CHUNK, chunk),
  stop: () => ipcRenderer.send(STOP)
})
