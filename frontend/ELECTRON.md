# DialogHelper - Electron 桌面应用

## 🚀 快速开始

### 1. 安装依赖

```bash
cd frontend
npm install
```

### 2. 开发模式运行

```bash
# 方法1: 使用脚本（推荐）
chmod +x start-electron.sh
./start-electron.sh

# 方法2: 直接运行
npm run electron:dev
```

这会同时启动：
- Vite 开发服务器（http://localhost:5173）
- Electron 桌面窗口

### 3. 打包应用

```bash
# 打包当前平台
npm run electron:build

# 打包结果在 dist-electron/ 目录
```

---

## 📦 打包产物

### macOS
- `DialogHelper-1.0.0.dmg` - 安装包
- `DialogHelper-1.0.0-mac.zip` - 压缩包

### Windows
- `DialogHelper Setup 1.0.0.exe` - 安装程序
- `DialogHelper 1.0.0.exe` - 便携版

### Linux
- `DialogHelper-1.0.0.AppImage` - AppImage 格式
- `dialoghelper_1.0.0_amd64.deb` - Debian 包

---

## 🔧 开发说明

### 目录结构

```
frontend/
├── electron/
│   ├── main.js       # Electron 主进程
│   └── preload.js    # Preload 脚本
├── src/              # React 源码
├── dist/             # 构建输出
└── dist-electron/    # Electron 打包输出
```

### 开发模式

开发模式下：
- 前端使用 Vite 热重载（http://localhost:5173）
- Electron 会自动加载这个地址
- 修改代码即时生效

### 生产打包

生产打包时：
- 先执行 `npm run build` 构建前端
- 再执行 `electron-builder` 打包应用
- 前端被嵌入到应用中

---

## 🎯 与后端通信

Electron 应用会连接本地后端：

```
前端（Electron）→ http://localhost:9000 → Python 后端
```

**启动顺序：**
1. 先启动 Python 后端（`python backend/run_server.py`）
2. 再启动 Electron 前端（`npm run electron:dev`）

---

## 🔐 安全特性

- ✅ `nodeIntegration: false` - 禁用 Node.js 集成
- ✅ `contextIsolation: true` - 启用上下文隔离
- ✅ `webSecurity: true` - 启用 Web 安全
- ✅ 单实例运行（防止多开）

---

## ⌨️ 快捷键

| 功能 | macOS | Windows/Linux |
|------|-------|---------------|
| 退出 | Cmd+Q | Ctrl+Q |
| 重新加载 | Cmd+R | Ctrl+R |
| 开发者工具 | 自动打开 | 自动打开 |
| 全屏 | F11 | F11 |
| 放大 | Cmd++ | Ctrl++ |
| 缩小 | Cmd+- | Ctrl+- |

---

## 📝 自定义配置

### 修改窗口大小

编辑 `electron/main.js`:

```javascript
mainWindow = new BrowserWindow({
  width: 1400,   // 改这里
  height: 900,   // 改这里
  minWidth: 1000,
  minHeight: 700,
  // ...
});
```

### 修改应用名称

编辑 `package.json`:

```json
{
  "name": "dialoghelper",
  "productName": "DialogHelper",  // 改这里
  "build": {
    "appId": "com.dialoghelper.app",  // 改这里
    // ...
  }
}
```

---

## 🐛 故障排除

### Q: Electron 窗口无法打开？

```bash
# 清理缓存重试
rm -rf node_modules dist dist-electron
npm install
npm run electron:dev
```

### Q: 连接后端失败？

1. 确认后端已启动（http://localhost:9000）
2. 检查 `.env` 中的 `VITE_API_BASE_URL`
3. 查看 Electron 开发者工具的 Console

### Q: 打包失败？

```bash
# macOS 需要签名（开发环境可跳过）
export CSC_IDENTITY_AUTO_DISCOVERY=false
npm run electron:build
```

---

## 🎉 完成！

现在你有一个完整的桌面应用了！

**启动命令：**
```bash
# 开发
./start-electron.sh

# 或
npm run electron:dev
```

**打包分发：**
```bash
npm run electron:build
```

