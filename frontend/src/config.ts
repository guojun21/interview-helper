// API 配置（硬编码）
export const CONFIG = {
  // DeepSeek 配置
  deepseek: {
    apiKey: 'sk-66137666196b4d73b892183a876994b0',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    maxTokens: 2000,
    temperature: 0.7,
  },
  
  // 科大讯飞配置
  xfyun: {
    appId: '8a2410fb',
    accessKeyId: 'e134c33470b15eb856530f925ac96524', // APIKey
    accessKeySecret: 'YWRkOTcwOWJiYWQ0MzNkN2Q0OGFmZWRk', // APISecret
    wsUrl: 'wss://office-api-ast-dx.iflyaisol.com/ast/communicate/v1',
  },
  
  // 后端 API 地址
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:9000',
}

