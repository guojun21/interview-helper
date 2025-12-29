"""
语音识别路由
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.services.xfyun_service import XfyunIATService
import json
import asyncio

router = APIRouter()

# 讯飞配置（从环境变量或配置文件读取）
XFYUN_APP_ID = "8a2410fb"
XFYUN_API_KEY = "e134c33470b15eb856530f925ac96524"
XFYUN_API_SECRET = "YWRkOTcwOWJiYWQ0MzNkN2Q0OGFmZWRk"


@router.websocket("/ws/speech")
async def websocket_speech_recognition(websocket: WebSocket):
    """
    WebSocket 语音识别端点
    
    前端发送：二进制音频数据（PCM，16k，16bit，单声道）
    后端返回：JSON 格式的识别结果
    """
    await websocket.accept()
    print("✅ [WebSocket] 前端连接成功")
    
    try:
        # 创建讯飞服务实例
        xfyun = XfyunIATService(XFYUN_APP_ID, XFYUN_API_KEY, XFYUN_API_SECRET)
        
        # 音频数据队列和停止标志
        audio_queue = asyncio.Queue()
        should_stop = False
        
        async def audio_generator():
            """从队列中读取音频数据"""
            while True:
                audio_data = await audio_queue.get()
                if audio_data is None:  # 结束标志
                    print("🏁 [音频生成器] 收到结束标志")
                    break
                yield audio_data
        
        audio_count = 0
        
        async def receive_audio():
            """接收前端发送的音频数据"""
            nonlocal audio_count, should_stop
            try:
                while True:
                    data = await websocket.receive()
                    
                    if "bytes" in data:
                        # 二进制音频数据
                        audio_data = data["bytes"]
                        audio_count += 1
                        if audio_count % 50 == 0:  # 每50帧打印一次
                            print(f"📥 [接收音频] 已接收 {audio_count} 帧，本帧大小: {len(audio_data)} 字节")
                        await audio_queue.put(audio_data)
                    elif "text" in data:
                        # 文本消息（可能是控制指令）
                        message = json.loads(data["text"])
                        if message.get("action") == "end":
                            # 结束信号
                            print(f"🏁 [接收音频] 收到结束信号，停止所有任务，共接收 {audio_count} 帧")
                            should_stop = True
                            await audio_queue.put(None)
                            break
            except WebSocketDisconnect:
                print(f"🔌 [WebSocket] 前端断开连接，停止所有任务，共接收 {audio_count} 帧")
                should_stop = True
                await audio_queue.put(None)
        
        async def send_results():
            """发送识别结果给前端，支持自动重连"""
            nonlocal should_stop
            reconnect_count = 0
            max_reconnects = 100  # 最多重连100次（支持长时间对话）
            
            while reconnect_count < max_reconnects and not should_stop:
                try:
                    if reconnect_count > 0:
                        print(f"🔄 [讯飞重连] 第 {reconnect_count} 次重连，继续识别...")
                    
                    # 每次重连都创建新的生成器
                    async for result in xfyun.recognize_stream(audio_generator()):
                        # 先发送数据，再检查停止信号
                        await websocket.send_json({
                            "code": 0,
                            "message": "success",
                            "data": {
                                "text": result["text"],
                                "is_last": result["is_last"]
                            }
                        })
                        print(f"✅ [已发送给前端] {result['text'][:50]}{'...' if len(result['text']) > 50 else ''}")
                        
                        # 如果是最终结果且收到停止信号，退出
                        if should_stop and result["is_last"]:
                            print(f"🛑 [讯飞] 已发送最终结果，检测到停止信号，中断发送")
                            break
                    
                    # 如果收到停止信号，退出重连循环
                    if should_stop:
                        print(f"🛑 [讯飞] 停止重连循环")
                        break
                    
                    # 如果 recognize_stream 正常结束（VAD 检测到静音），自动重连
                    reconnect_count += 1
                    print(f"🔄 [讯飞] 一轮识别完成（第 {reconnect_count} 轮），准备重新连接...")
                    await asyncio.sleep(0.1)  # 短暂延迟，避免过快重连
                    
                except Exception as e:
                    print(f"❌ [讯飞] 识别错误: {e}")
                    break
            
            if should_stop:
                print(f"✅ [讯飞] 已停止，总共完成 {reconnect_count} 轮识别")
        
        # 并发执行接收和发送
        await asyncio.gather(
            receive_audio(),
            send_results()
        )
        
    except WebSocketDisconnect:
        print("🔌 [WebSocket] 连接断开")
    except Exception as e:
        print(f"❌ [WebSocket] 错误: {e}")
        await websocket.send_json({
            "code": -1,
            "message": str(e),
            "data": None
        })
    finally:
        await websocket.close()
        print("🔌 [WebSocket] 连接已关闭")

