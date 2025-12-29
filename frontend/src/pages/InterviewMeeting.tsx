import React, { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInterviewStore } from '@/store/interviewStore'
import { createBackendSpeechWebSocket, sendAudioToBackend, sendEndToBackend, parseBackendResult } from '@/api/backendSpeech'
import ReactMarkdown from 'react-markdown'

const InterviewMeeting: React.FC = () => {
  const navigate = useNavigate()
  const addTransResult = useInterviewStore(s => s.addTransResult)
  const addMessage = useInterviewStore(s => s.addMessage)
  const messages = useInterviewStore(s => s.messages)
  const answers = useInterviewStore(s => s.answers)
  const [recording, setRecording] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const [audioActive, setAudioActive] = useState(false)
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectCountRef = useRef(0)
  const maxReconnectAttempts = 5
  const keepaliveIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastAudioTimeRef = useRef<number>(Date.now())
  const KEEPALIVE_CHECK_INTERVAL = 2000 // 每2秒检查一次
  const MAX_SILENCE_TIME = 8000 // 最多8秒无数据就发送零帧
  
  // 自动滚动到底部的引用
  const chatAreaRef = useRef<HTMLDivElement>(null)
  const voiceAreaRef = useRef<HTMLDivElement>(null)
  const voiceContentRef = useRef<HTMLDivElement>(null)

  // 处理转写结果
  const handleBackendResult = (data: any) => {
    console.log('✅ [收到后端数据]', data)
    if (data.code === 0) {
      const text = parseBackendResult(data);
      console.log('📝 [解析后的文本]', text)
      
      if (text) {
        console.log('📌 [准备添加消息]', { content: text, role: 'user', status: 'sent' })
        
        addTransResult({
          action: 'result',
          code: String(data.code),
          data: data.data,
          desc: data.message || 'success',
          sid: '',
        })
        
        // 添加消息（修正字段名：content 和 role，不是 text 和 type）
        addMessage({
          content: text,  // ✅ 正确：使用 content
          role: 'user',   // ✅ 正确：使用 role ('user' 或 'asker')
          status: 'sent'  // ✅ 正确：添加 status
        })
        
        console.log('✅ [消息已添加到 store]', text)
        
        // TODO: 集成智能AI问题检测
        // handleQuestionDetected()
      } else {
        console.warn('⚠️ [文本为空，不添加消息]')
      }
    } else {
      console.error('❌ [转写错误]', data.code, data.message)
    }
  }

  // 清理音频资源
  const cleanupAudio = () => {
    console.log('🧹 清理音频资源...');
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (keepaliveIntervalRef.current) {
      clearInterval(keepaliveIntervalRef.current);
      keepaliveIntervalRef.current = null;
      console.log('🧹 清除保活定时器');
    }
    setAudioActive(false);
  }

  // 重连 WebSocket
  const reconnectWebSocket = async () => {
    if (reconnectCountRef.current >= maxReconnectAttempts) {
      console.error(`❌ 已达到最大重连次数 (${maxReconnectAttempts})，停止重连`)
      cleanupAudio()
      setRecording(false)
      alert('WebSocket 连接失败次数过多，已停止录音')
      return
    }
    
    reconnectCountRef.current++
    const delay = Math.min(1000 * reconnectCountRef.current, 5000) // 最多等5秒
    console.log(`🔄 [重连] 第 ${reconnectCountRef.current} 次尝试，${delay}ms 后重连...`)
    
    reconnectTimerRef.current = setTimeout(async () => {
      if (recording && audioStreamRef.current) {
        await setupWebSocketAndAudio(audioStreamRef.current)
      }
    }, delay)
  }
  
  // 设置 WebSocket 和音频处理
  const setupWebSocketAndAudio = async (stream: MediaStream) => {
    console.log('🌐 [设置] 连接 WebSocket...')
    const ws = createBackendSpeechWebSocket({
      onResult: (data) => {
        console.log('📩 收到识别结果:', data)
        handleBackendResult(data)
        // 重连成功，重置计数
        reconnectCountRef.current = 0
      },
      onError: (e) => {
        console.error('❌ WebSocket 错误:', e)
        if (recording) {
          reconnectWebSocket()
        }
      },
      onClose: async () => {
        console.log('🔌 WebSocket 关闭')
        if (recording) {
          console.log('🔄 检测到断开，准备重连...')
          // 关闭旧音频上下文以停止处理
          if (audioContextRef.current) {
            await audioContextRef.current.close();
            audioContextRef.current = null;
            console.log('🔌 关闭旧音频上下文');
          }
          reconnectWebSocket()
        } else {
          cleanupAudio()
          setRecording(false)
        }
      },
      onOpen: async () => {
          console.log('✅ [WebSocket] 连接成功')
          try {
            
            // 3. 使用 AudioWorklet 处理音频
            console.log('🔊 [步骤3] 创建音频处理器...')
            const audioContext = new AudioContext({ sampleRate: 16000 })
            
            // 加载 AudioWorklet 模块
            await audioContext.audioWorklet.addModule('/audio-processor.js')
            console.log('✅ AudioWorklet 模块已加载')
            
            const source = audioContext.createMediaStreamSource(stream)
            const workletNode = new AudioWorkletNode(audioContext, 'audio-processor')
            
            let frameCount = 0
            
            // 监听来自 AudioWorklet 的消息
            workletNode.port.onmessage = (event) => {
              if (event.data.type === 'audio') {
                const audioBuffer = event.data.data
                frameCount++
                
                // 更新最后接收音频的时间
                lastAudioTimeRef.current = Date.now()
                
                if (frameCount % 50 === 0) {
                  console.log(`📤 [前端] 已发送 ${frameCount} 帧音频，本帧大小: ${audioBuffer.byteLength} 字节`)
                }
                
                // 发送到后端
                if (ws.readyState === WebSocket.OPEN) {
                  sendAudioToBackend(ws, audioBuffer)
                } else {
                  console.warn(`⚠️ [前端] WebSocket 未打开，状态: ${ws.readyState}`)
                }
                
                // 简单的音量检测
                const pcmData = new Int16Array(audioBuffer)
                let sum = 0
                for (let i = 0; i < pcmData.length; i++) {
                  sum += Math.abs(pcmData[i])
                }
                const avg = sum / pcmData.length / 32768
                setAudioActive(avg > 0.02)
              }
            }
            
            source.connect(workletNode)
            workletNode.connect(audioContext.destination)
            
            audioContextRef.current = audioContext
            console.log('✅ 录音和识别已开始')
            
            // 启动保活检查定时器，监控音频流是否正常
            if (keepaliveIntervalRef.current) {
              clearInterval(keepaliveIntervalRef.current);
            }
            lastAudioTimeRef.current = Date.now();
            keepaliveIntervalRef.current = setInterval(() => {
              const now = Date.now();
              const silenceTime = now - lastAudioTimeRef.current;
              
              if (silenceTime > MAX_SILENCE_TIME && ws.readyState === WebSocket.OPEN) {
                // 超过8秒没收到音频数据，手动发送零帧
                const zeroBuffer = new ArrayBuffer(1280);
                sendAudioToBackend(ws, zeroBuffer);
                lastAudioTimeRef.current = now; // 更新时间防止连续发送
                console.log(`⚠️ [保活] 检测到 ${(silenceTime/1000).toFixed(1)}s 无音频数据，发送零帧保持连接`);
              }
            }, KEEPALIVE_CHECK_INTERVAL);
            console.log(`💓 [保活] 已启动，每 ${KEEPALIVE_CHECK_INTERVAL}ms 检查一次，超过 ${MAX_SILENCE_TIME}ms 无数据将发送零帧`);
            
          } catch (err: any) {
            console.error('❌ 启动音频处理失败:', err)
            ws.close()
            if (recording) {
              reconnectWebSocket()
            }
          }
        }
      })
      
    wsRef.current = ws
  }
  
  // 开始面试
  const handleStart = async () => {
    console.log('🎬 [按钮点击] 开始面试')
    
    try {
      setRecording(true)
      reconnectCountRef.current = 0
      
      // 1. 请求麦克风权限
      console.log('🎤 [步骤1] 请求麦克风权限...')
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
        } 
      })
      console.log('✅ [步骤1] 麦克风权限已授予')
      audioStreamRef.current = stream
      
      // 2. 设置 WebSocket 和音频处理
      await setupWebSocketAndAudio(stream)
      
    } catch (err: any) {
      console.error('❌ 开始面试失败:', err)
      setRecording(false)
      alert('启动失败: ' + err.message + '\n\n请检查麦克风权限')
    }
  }
  // 停止面试
  const handleStop = () => {
    console.log('⏹️ [按钮点击] 停止录音')
    setRecording(false)
    
    // 清除重连定时器
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    reconnectCountRef.current = 0
    
    // 发送结束信号
    if (wsRef.current) {
      sendEndToBackend(wsRef.current);
    }
    
    cleanupAudio();
  }

  // 自动滚动到底部
  React.useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight
    }
  }, [answers])

  React.useEffect(() => {
    if (voiceContentRef.current) {
      voiceContentRef.current.scrollTop = voiceContentRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div style={{ 
      width: '100%', 
      height: '100vh', 
      background: '#fff', 
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* 主内容区 */}
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'row', 
        overflow: 'hidden',
        minHeight: 0 // 重要：允许flex子项收缩
      }}>
        {/* 聊天区：Q左A右分栏 */}
        <div 
          ref={chatAreaRef}
          style={{ 
            flex: 1, 
            padding: 24, 
            overflowY: 'auto', 
            display: 'flex', 
            flexDirection: 'column', 
            gap: 16,
            minHeight: 0 // 重要：允许滚动
          }}
        >
          {answers.length > 0 ? answers.map((ans, idx) => (
            <div key={ans.id || idx} style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'flex-start', 
              gap: 24,
              minHeight: 'fit-content'
            }}>
              {/* Q 左侧 */}
              <div style={{ 
                flex: 1, 
                background: '#f5f5f5', 
                borderRadius: 8, 
                padding: 12, 
                textAlign: 'left', 
                maxWidth: '30%',
                minWidth: '200px'
              }}>
                <b>Q:</b> {ans.question}
              </div>
              {/* A 右侧 */}
              <div style={{ 
                flex: 2, 
                background: '#e6f7ff', 
                borderRadius: 8, 
                padding: 12, 
                textAlign: 'left'
              }}>
                <b>A:</b> <ReactMarkdown>{ans.message}</ReactMarkdown>
              </div>
            </div>
          )) : (
            <div style={{ 
              fontSize: 32, 
              color: '#eee', 
              textAlign: 'center',
              margin: 'auto'
            }}>
              暂无问答
            </div>
          )}
        </div>
        
        {/* 语音区 */}
        <div 
          ref={voiceAreaRef}
          style={{ 
            width: 250, 
            borderLeft: '1px solid #eee', 
            padding: 16,
            overflowY: 'auto',
            minHeight: 0, // 重要：允许滚动
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <h3 style={{ margin: '0 0 16px 0', fontSize: 16, color: '#666', flexShrink: 0 }}>实时转录</h3>
          <div ref={voiceContentRef} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {messages.map((msg, idx) => (
              <div key={msg.id || idx} style={{ 
                marginBottom: 8, 
                background: msg.role === 'user' ? '#f0f8ff' : '#f5f5f5', 
                borderRadius: 8, 
                padding: 8,
                fontSize: 12,
                lineHeight: 1.4
              }}>
                <b style={{ color: msg.role === 'user' ? '#1677ff' : '#666' }}>
                  {msg.role === 'user' ? '用户' : '助手'}：
                </b>
                {msg.content}
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* 底部操作栏 - 固定在屏幕底部 */}
      <div style={{ 
        height: '80px',
        borderTop: '1px solid #eee', 
        padding: '16px 24px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        background: '#fff',
        boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.1)',
        flexShrink: 0
      }}>
        <div style={{ fontSize: 12, color: '#666' }}>
          帮助中心<br />
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <input type="checkbox" />
            固定当前答案
          </label>
        </div>
        
        <div style={{ flex: 1, margin: '0 24px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <input 
            style={{ 
              flex: 1, 
              padding: '8px 12px', 
              border: '1px solid #d9d9d9', 
              borderRadius: 4,
              fontSize: 14
            }} 
            placeholder="输入你的问题" 
          />
          <button 
            onClick={() => console.log('📤 [按钮点击] 发送消息')}
            style={{ 
            padding: '8px 16px', 
            border: '1px solid #d9d9d9', 
            borderRadius: 4, 
            background: '#fff',
            cursor: 'pointer',
            fontSize: 14
          }}>
            发送
          </button>
          <button 
            onClick={() => console.log('✏️ [按钮点击] 自定义提示词')}
            style={{ 
            padding: '8px 12px', 
            border: '1px solid #d9d9d9', 
            borderRadius: 4, 
            background: '#fff',
            cursor: 'pointer',
            fontSize: 12
          }}>
            自定义提示词
          </button>
          <button 
            onClick={() => console.log('📝 [按钮点击] 笔记辅助')}
            style={{ 
            padding: '8px 12px', 
            border: '1px solid #d9d9d9', 
            borderRadius: 4, 
            background: '#fff',
            cursor: 'pointer',
            fontSize: 12
          }}>
            笔记辅助
          </button>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              display: 'inline-block',
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: recording ? (audioActive ? '#52c41a' : '#ff4d4f') : '#d9d9d9',
            }} />
            <span style={{ fontSize: 12, color: '#666' }}>
              {recording ? (audioActive ? '录音中' : '静音中') : '未录音'}
            </span>
          </div>
          
          <button 
            style={{ 
              background: recording ? '#ff4d4f' : '#1677ff', 
              color: '#fff', 
              padding: '10px 20px', 
              border: 'none', 
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500
            }} 
            onClick={recording ? handleStop : handleStart}
          >
            {recording ? '停止录音' : '开始面试'}
          </button>
          
          <button 
            style={{ 
              padding: '10px 16px', 
              border: '1px solid #d9d9d9', 
              borderRadius: 6, 
              background: '#fff',
              cursor: 'pointer',
              fontSize: 14
            }} 
            onClick={() => {
              console.log('⬅️ [按钮点击] 返回设置')
              navigate('/interview/new')
            }}
          >
            返回设置
          </button>
        </div>
      </div>
    </div>
  )
}

export default InterviewMeeting 