import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
// electron-updater is CommonJS with a named `autoUpdater` export (no default).
import { autoUpdater } from "electron-updater";
import { clinikoGetAll } from "./cliniko";

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Open external links in the user's browser, not a new Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    win.loadURL(process.env.RENDERER_URL ?? "http://localhost:5280");
  } else {
    win.loadFile(path.join(process.resourcesPath, "renderer", "index.html"));
  }
}

// Renderer → main: fetch a Cliniko resource. Returns a discriminated result so
// the renderer can distinguish auth failures (to re-prompt for the key).
ipcMain.handle("cliniko:get", async (_e, { resource, params, apiKey }) => {
  try {
    const items = await clinikoGetAll(resource, params, apiKey);
    return { ok: true, items };
  } catch (err: any) {
    return { ok: false, status: err?.status ?? 500, error: err?.message ?? String(err) };
  }
});

app.whenReady().then(() => {
  createWindow();
  if (!isDev) autoUpdater.checkForUpdatesAndNotify();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
