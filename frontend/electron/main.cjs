const { app, BrowserWindow, Menu, session } = require('electron');
const path = require('path');

let mainWindow = null;

// 请求媒体访问权限（麦克风）
async function requestMediaAccess() {
  try {
    const status = await require('electron').systemPreferences.getMediaAccessStatus('microphone');
    console.log('🎤 麦克风权限状态:', status);
    
    if (status !== 'granted') {
      console.log('🎤 请求麦克风权限...');
      const granted = await require('electron').systemPreferences.askForMediaAccess('microphone');
      console.log('🎤 麦克风权限授予:', granted);
    }
  } catch (err) {
    console.error('❌ 请求麦克风权限失败:', err);
  }
}

function createWindow() {
  // 创建主窗口
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // 关闭 web 安全限制，允许麦克风访问
      enableRemoteModule: false,
      // 允许媒体设备访问
      allowRunningInsecureContent: false,
    },
    show: false, // 等加载完再显示
    backgroundColor: '#ffffff',
  });

  // 开发环境：加载 Vite 开发服务器
  if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools(); // 打开开发者工具
  } 
  // 生产环境：加载打包后的文件
  else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 窗口关闭事件
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 创建菜单
  createMenu();
}

function createMenu() {
  const template = [
    {
      label: '应用',
      submenu: [
        {
          label: '关于 DialogHelper',
          role: 'about',
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: '强制重新加载', accelerator: 'CmdOrCtrl+Shift+R', role: 'forceReload' },
        { type: 'separator' },
        { label: '开发者工具', accelerator: 'CmdOrCtrl+Option+I', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '实际大小', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { label: '放大', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: '全屏', accelerator: 'F11', role: 'togglefullscreen' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', accelerator: 'CmdOrCtrl+M', role: 'minimize' },
        { label: '关闭', accelerator: 'CmdOrCtrl+W', role: 'close' },
      ],
    },
  ];

  // macOS 特殊处理
  if (process.platform === 'darwin') {
    template[0].label = 'DialogHelper';
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// App 准备就绪
app.whenReady().then(async () => {
  // 请求麦克风权限
  await requestMediaAccess();
  
  // 设置权限处理器
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    console.log('🔐 权限请求:', permission);
    if (permission === 'media' || permission === 'microphone') {
      callback(true); // 自动授予麦克风权限
    } else {
      callback(false);
    }
  });
  
  createWindow();

  // macOS 特有：点击 dock 图标时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭时退出
app.on('window-all-closed', () => {
  // macOS 下通常不退出
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 防止多实例
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // 有人试图运行第二个实例，聚焦主窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

