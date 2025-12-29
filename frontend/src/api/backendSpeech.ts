// 后端语音识别 API
// 通过后端封装讯飞 API，避免前端直接调用

export function createBackendSpeechWebSocket({
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
  // 连接后端 WebSocket
  const ws = new WebSocket('ws://localhost:9000/api/speech/ws/speech');
  
  ws.onopen = () => {
    console.log('✅ [后端WebSocket] 连接成功');
    onOpen && onOpen();
  };
  
  ws.onmessage = (e) => {
    console.log('🔔 [原始消息] 收到 WebSocket 消息，类型:', typeof e.data, '内容:', e.data);
    try {
      const data = JSON.parse(e.data);
      console.log('📩 [后端WebSocket] 解析后的消息:', data);
      
      if (data.code === 0) {
        // 成功：返回识别结果
        console.log('✅ [后端WebSocket] 准备调用 onResult 回调');
        onResult(data);
        console.log('✅ [后端WebSocket] onResult 回调已调用');
      } else {
        // 错误
        console.error('❌ [后端WebSocket] 错误:', data.message);
        onError && onError(new Event('error'));
      }
    } catch (err) {
      console.error('❌ [后端WebSocket] 解析消息失败:', err, '原始数据:', e.data);
    }
  };
  
  ws.onerror = (e) => {
    console.error('❌ [后端WebSocket] 连接错误:', e);
    onError && onError(e);
  };
  
  ws.onclose = () => {
    console.log('🔌 [后端WebSocket] 连接关闭');
    onClose && onClose();
  };
  
  return ws;
}

// 发送音频数据（二进制）
export function sendAudioToBackend(ws: WebSocket, audioData: ArrayBuffer) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(audioData);
  }
}

// 发送结束信号
export function sendEndToBackend(ws: WebSocket) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ action: 'end' }));
  }
}

// 解析后端返回的结果
export function parseBackendResult(data: any): string {
  try {
    return data.data?.text || '';
  } catch (err) {
    console.error('❌ [解析结果] 失败:', err);
    return '';
  }
}

