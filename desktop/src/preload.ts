import { contextBridge, ipcRenderer } from "electron";

/**
 * Expose a minimal Cliniko bridge to the renderer. The renderer passes the
 * API key (from localStorage) with each call; the main process does the fetch.
 */
contextBridge.exposeInMainWorld("cliniko", {
  get: (resource: string, params: Record<string, string | string[]>, apiKey: string) =>
    ipcRenderer.invoke("cliniko:get", { resource, params, apiKey }),
});
