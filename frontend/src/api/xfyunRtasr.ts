// 科大讯飞语音听写（流式版）WebAPI
// 文档参考：new讯飞文档.md

import CryptoJS from 'crypto-js';
import type { MeetingMessage } from '@/store/interviewStore'
import { useInterviewStore } from '@/store/interviewStore'
import { CONFIG } from '@/config'

// 生成 RFC1123 格式的 UTC 时间
function getRFC1123Date() {
  return new Date().toUTCString();
}

// 生成鉴权 URL
export function getRtasrWebSocketUrl() {
  const appId = CONFIG.xfyun.appId;
  const apiKey = CONFIG.xfyun.accessKeyId;
  const apiSecret = CONFIG.xfyun.accessKeySecret;
  
  // WebSocket 地址
  const url = 'wss://iat-api.xfyun.cn/v2/iat';
  const host = 'iat-api.xfyun.cn';
  const path = '/v2/iat';
  const date = getRFC1123Date();
  
  // 1. 构建签名原始字符串
  const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
  
  console.log('🔐 [签名原文]:', signatureOrigin);
  
  // 2. 使用 HMAC-SHA256 计算签名
  const signature = CryptoJS.HmacSHA256(signatureOrigin, apiSecret);
  const signatureBase64 = CryptoJS.enc.Base64.stringify(signature);
  
  console.log('🔐 [签名结果]:', signatureBase64);
  
  // 3. 构建 authorization 原始字符串
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signatureBase64}"`;
  
  console.log('🔐 [authorization原文]:', authorizationOrigin);
  
  // 4. Base64 编码 authorization
  const authorization = btoa(authorizationOrigin);
  
  console.log('🔐 [authorization]:', authorization);
  
  // 5. 构建 WebSocket URL
  const wsUrl = `${url}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${encodeURIComponent(host)}`;
  
  console.log('🌐 [WebSocket URL]:', wsUrl);
  
  return wsUrl;
}

// 创建 WebSocket 连接
export function createRtasrWebSocket({
  onResult,
  onError,
  onOpen,
  onClose
}: {
  onResult: (data: any) => void,
  onError?: (e: Event) => void,
  onOpen?: () => void,
  onClose?: () => void
}) {
  const ws = new WebSocket(getRtasrWebSocketUrl());
  
  ws.onopen = () => {
    console.log('✅ [WebSocket] 连接成功');
    onOpen && onOpen();
  };
  
  ws.onmessage = (e) => {
    try {
      const json = JSON.parse(e.data);
      console.log('📩 [WebSocket] 收到消息:', json);
      
      if (json.code !== 0) {
        console.error('❌ [WebSocket] 错误:', json.code, json.message);
        onError && onError(new Event('error'));
        return;
      }
      
      // 识别结果
      if (json.data && json.data.result) {
        onResult(json);
      }
    } catch (err) {
      console.error('❌ [WebSocket] 解析消息失败:', err);
    }
  };
  
  ws.onerror = (e) => {
    console.error('❌ [WebSocket] 连接错误:', e);
    onError && onError(e);
  };
  
  ws.onclose = () => {
    console.log('🔌 [WebSocket] 连接关闭');
    onClose && onClose();
  };
  
  return ws;
}

// 发送首帧（包含配置参数）
export function sendFirstFrame(ws: WebSocket, audioData: ArrayBuffer) {
  const appId = CONFIG.xfyun.appId;
  
  // 转换为 base64
  const base64Audio = btoa(
    String.fromCharCode(...new Uint8Array(audioData))
  );
  
  const params = {
    common: {
      app_id: appId
    },
    business: {
      language: 'zh_cn',
      domain: 'iat',
      accent: 'mandarin',
      vad_eos: 3000,
      dwa: 'wpgs',
      ptt: 1
    },
    data: {
      status: 0, // 第一帧
      format: 'audio/L16;rate=16000',
      encoding: 'raw',
      audio: base64Audio
    }
  };
  
  console.log('📤 [发送首帧]:', params);
  
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(params));
  }
}

// 发送中间帧
export function sendAudio(ws: WebSocket, audioData: ArrayBuffer, isLast: boolean = false) {
  // 转换为 base64
  const base64Audio = btoa(
    String.fromCharCode(...new Uint8Array(audioData))
  );
  
  const params = {
    data: {
      status: isLast ? 2 : 1, // 1=中间帧，2=最后一帧
      format: 'audio/L16;rate=16000',
      encoding: 'raw',
      audio: base64Audio
    }
  };
  
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(params));
  }
}

// 解析识别结果
export function parseXfyunResult(data: any): string {
  try {
    if (!data.data || !data.data.result || !data.data.result.ws) {
      return '';
    }
    
    const ws = data.data.result.ws;
    let text = '';
    
    for (const item of ws) {
      if (item.cw) {
        for (const word of item.cw) {
          text += word.w;
        }
      }
    }
    
    return text;
  } catch (err) {
    console.error('❌ [解析结果] 失败:', err);
    return '';
  }
}

// ============== 兼容原有代码的导出 ==============

// 解析 RTasr 结果（兼容旧代码）
export function parseRtasrResult(data: any, onQuestionDetected?: () => void): any[] {
  // 兼容旧代码的返回格式
  const text = parseXfyunResult(data);
  
  if (!text) {
    return [];
  }
  
  // 返回消息数组格式
  return [{
    text: text,
    timestamp: Date.now(),
    type: 'transcription'
  }];
}

// 音频活跃状态管理（占位函数）
let audioActiveState = false;

export function setAudioActiveState(active: boolean) {
  audioActiveState = active;
  console.log('🎙️ [音频状态]:', active ? '活跃' : '静音');
}

export function getAudioActiveState(): boolean {
  return audioActiveState;
}

// 清理问题检测（占位函数）
export function cleanupQuestionDetection() {
  console.log('🧹 [清理] 问题检测清理');
}

// 发送结束标识（兼容）
export function sendEnd(ws: WebSocket, sessionId?: string) {
  // IAT API 通过 status=2 结束会话
  const params = {
    data: {
      status: 2,
      format: 'audio/L16;rate=16000',
      encoding: 'raw',
      audio: ''
    }
  };
  
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(params));
  }
}

// 启动实时转写
export function startRealTimeTranscription({
  onResult,
  onError,
}: {
  onResult: (text: string) => void
  onError?: (error: string) => void
}) {
  let ws: WebSocket | null = null
  
  ws = createRtasrWebSocket({
    onResult: (data) => {
      const text = parseXfyunResult(data)
      if (text) {
        onResult(text)
      }
    },
    onError: (e) => {
      console.error('实时转写错误:', e)
      onError && onError('WebSocket 连接失败')
    },
    onOpen: () => {
      console.log('实时转写已开始')
    },
    onClose: () => {
      console.log('实时转写已结束')
    },
  })
  
  return {
    stop: () => {
      if (ws) {
        sendEnd(ws);
        ws.close()
        ws = null
      }
    },
    send: (audioData: ArrayBuffer) => {
      if (ws) {
        sendAudio(ws, audioData)
      }
    },
  }
}
