import {join as pathJoin} from 'path';

import { app, BrowserWindow } from 'electron';
import { AppStore } from './app-store';
import { FFmpegRunner } from './ffmpeg-runner';

// enforcing sandbox on all renderer processes (for better security)
app.enableSandbox();

// Set up electron store
// If you want to use a custom path for application data storage, you can set the path this way:
// app.setPath ('userData', 'path/to/app/data'));
AppStore.init();
FFmpegRunner.init();

function createWindow() {
  // Create the browser window.
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: pathJoin(__dirname, './preload.js'),
    },
  });

  // Load the index.html of the app.
  if (process.env['NODE_ENV'] === 'dev') {
    win.loadURL('http://localhost:4200');
  } else win.loadFile(pathJoin(__dirname, '../app/index.html'));
}

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
