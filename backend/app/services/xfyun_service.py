"""
科大讯飞语音听写服务
"""
import base64
import hashlib
import hmac
import json
import time
from datetime import datetime
from typing import Optional
from urllib.parse import urlencode
import websockets
import asyncio
from email.utils import formatdate


class XfyunIATService:
    """讯飞语音听写服务"""
    
    def __init__(self, app_id: str, api_key: str, api_secret: str):
        self.app_id = app_id
        self.api_key = api_key
        self.api_secret = api_secret
        self.ws_url = "wss://iat-api.xfyun.cn/v2/iat"
        
    def generate_url(self) -> str:
        """生成鉴权 URL"""
        # 1. 生成 RFC1123 格式的时间戳
        date = formatdate(timeval=None, localtime=False, usegmt=True)
        
        # 2. 构建签名原始字符串
        signature_origin = f"host: iat-api.xfyun.cn\ndate: {date}\nGET /v2/iat HTTP/1.1"
        
        # 3. 使用 HMAC-SHA256 计算签名
        signature_sha = hmac.new(
            self.api_secret.encode('utf-8'),
            signature_origin.encode('utf-8'),
            digestmod=hashlib.sha256
        ).digest()
        signature = base64.b64encode(signature_sha).decode('utf-8')
        
        # 4. 构建 authorization 原始字符串
        authorization_origin = (
            f'api_key="{self.api_key}", '
            f'algorithm="hmac-sha256", '
            f'headers="host date request-line", '
            f'signature="{signature}"'
        )
        
        # 5. Base64 编码 authorization
        authorization = base64.b64encode(authorization_origin.encode('utf-8')).decode('utf-8')
        
        # 6. 构建完整 URL
        params = {
            'authorization': authorization,
            'date': date,
            'host': 'iat-api.xfyun.cn'
        }
        
        url = f"{self.ws_url}?{urlencode(params)}"
        return url
    
    async def recognize_stream(self, audio_generator):
        """
        流式语音识别
        
        Args:
            audio_generator: 异步生成器，产生音频数据块
            
        Yields:
            识别结果文本
        """
        url = self.generate_url()
        
        async with websockets.connect(url) as ws:
            print(f"✅ [讯飞] WebSocket 连接成功")
            
            # 创建发送和接收任务
            async def send_audio():
                is_first = True
                frame_count = 0
                async for audio_data in audio_generator:
                    # None 是结束标志，退出循环
                    if audio_data is None:
                        break
                    
                    # 允许空数据（零帧，bytes长度为0或全零），用于保持连接
                    frame_count += 1
                    if frame_count % 50 == 0:
                        print(f"📤 [讯飞] 已发送 {frame_count} 帧到讯飞，本帧大小: {len(audio_data)} 字节")
                        
                    # Base64 编码音频数据（包括零数据）
                    audio_base64 = base64.b64encode(audio_data).decode('utf-8')
                    
                    if is_first:
                        # 首帧：包含完整配置
                        frame = {
                            "common": {
                                "app_id": self.app_id
                            },
                            "business": {
                                "language": "zh_cn",
                                "domain": "iat",
                                "accent": "mandarin",
                                "vad_eos": 10000,  # 延长到10秒，避免过早结束
                                "dwa": "wpgs",
                                "ptt": 1
                            },
                            "data": {
                                "status": 0,  # 第一帧
                                "format": "audio/L16;rate=16000",
                                "encoding": "raw",
                                "audio": audio_base64
                            }
                        }
                        is_first = False
                    else:
                        # 中间帧
                        frame = {
                            "data": {
                                "status": 1,  # 中间帧
                                "format": "audio/L16;rate=16000",
                                "encoding": "raw",
                                "audio": audio_base64
                            }
                        }
                    
                    await ws.send(json.dumps(frame))
                
                # 发送结束帧
                end_frame = {
                    "data": {
                        "status": 2,  # 结束帧
                        "format": "audio/L16;rate=16000",
                        "encoding": "raw",
                        "audio": ""
                    }
                }
                await ws.send(json.dumps(end_frame))
                print(f"✅ [讯飞] 音频发送完成")
            
            async def receive_results():
                accumulated_text = []  # 累积的完整文本（按 sn 索引）
                while True:
                    try:
                        message = await ws.recv()
                        data = json.loads(message)
                        
                        # 打印完整的讯飞返回数据
                        print(f"📩 [讯飞返回] {json.dumps(data, ensure_ascii=False)}")
                        
                        if data.get('code') != 0:
                            print(f"❌ [讯飞] 错误: {data.get('code')} - {data.get('message')}")
                            break
                        
                        # 解析识别结果
                        result_data = data.get('data', {}).get('result', {})
                        ws_list = result_data.get('ws', [])
                        pgs = result_data.get('pgs', 'apd')
                        rg = result_data.get('rg', [])
                        sn = result_data.get('sn', 0)
                        is_last = result_data.get('ls', False)
                        
                        # 提取当前帧的文本
                        current_text = ''
                        for ws_item in ws_list:
                            for cw in ws_item.get('cw', []):
                                current_text += cw.get('w', '')
                        
                        # 根据 pgs 处理文本累积
                        if pgs == 'apd':
                            # 追加模式：直接添加到累积文本
                            accumulated_text.append(current_text)
                            print(f"📝 [追加] sn={sn}: {current_text}")
                        elif pgs == 'rpl' and len(rg) == 2:
                            # 替换模式：替换指定范围的文本
                            start_idx = rg[0] - 1  # rg 从 1 开始，转换为 0 索引
                            end_idx = rg[1]
                            accumulated_text = accumulated_text[:start_idx] + [current_text]
                            print(f"📝 [替换] sn={sn}, rg={rg}: {current_text}")
                        else:
                            # 其他情况，直接覆盖
                            accumulated_text = [current_text]
                            print(f"📝 [覆盖] sn={sn}: {current_text}")
                        
                        # 生成完整文本
                        full_text = ''.join(accumulated_text).strip()
                        
                        # 只在最后一片结果时发送完整文本
                        if is_last and full_text:
                            print(f"✅ [最终文本] {full_text}")
                            yield {'text': full_text, 'is_last': True}
                            print(f"✅ [讯飞] 识别完成（最后一片结果）")
                            break
                            
                    except websockets.exceptions.ConnectionClosed:
                        print(f"🔌 [讯飞] 连接关闭")
                        break
            
            # 并发执行发送和接收
            send_task = asyncio.create_task(send_audio())
            
            try:
                async for result in receive_results():
                    yield result
            finally:
                # 接收结束后，取消发送任务（如果还在运行）
                if not send_task.done():
                    send_task.cancel()
                    print(f"🛑 [讯飞] 识别结束，取消发送任务")
                try:
                    await send_task
                except asyncio.CancelledError:
                    print(f"✅ [讯飞] 发送任务已取消")
                    pass

