// Preload 脚本（目前为空，未来可扩展）
// 用于在渲染进程中安全地暴露 Node.js API

const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 未来可以添加 IPC 通信方法
  // 例如：
  // sendMessage: (channel, data) => ipcRenderer.send(channel, data),
  // onMessage: (channel, callback) => ipcRenderer.on(channel, callback),
});

