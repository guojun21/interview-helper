#!/usr/bin/env python3
"""
Run the FastAPI server
"""

import uvicorn
import os
import subprocess
import sys
import time

def kill_process_on_port(port: int, max_retries: int = 3):
    """杀死占用指定端口的进程，带重试机制"""
    for attempt in range(max_retries):
        try:
            # macOS/Linux: 使用 lsof 查找占用端口的进程
            result = subprocess.run(
                ['lsof', '-ti', f':{port}'],
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0 and result.stdout.strip():
                pids = result.stdout.strip().split('\n')
                for pid in pids:
                    if pid:
                        print(f"🔪 正在杀死占用端口 {port} 的进程 (PID: {pid})...")
                        subprocess.run(['kill', '-9', pid], check=False)
                        print(f"✅ 已杀死进程 {pid}")
                
                # 等待端口释放
                print(f"⏳ 等待端口 {port} 释放...")
                time.sleep(2)
                
                # 再次检查
                check_result = subprocess.run(
                    ['lsof', '-ti', f':{port}'],
                    capture_output=True,
                    text=True
                )
                
                if check_result.returncode != 0 or not check_result.stdout.strip():
                    print(f"✅ 端口 {port} 已释放")
                    return True
                else:
                    print(f"⚠️ 端口 {port} 仍被占用，重试中... (尝试 {attempt + 1}/{max_retries})")
            else:
                print(f"✅ 端口 {port} 未被占用")
                return True
                
        except FileNotFoundError:
            # lsof 命令不存在（Windows系统）
            print(f"⚠️ 无法检查端口占用（lsof 命令不存在）")
            return False
        except Exception as e:
            print(f"⚠️ 检查端口占用时出错: {e}")
            return False
    
    print(f"❌ 无法释放端口 {port}，请手动检查")
    return False

if __name__ == "__main__":
    PORT = 9000
    
    # 检查并杀死占用端口的进程
    print(f"🔍 检查端口 {PORT} 是否被占用...")
    if not kill_process_on_port(PORT):
        print(f"❌ 端口 {PORT} 清理失败，尝试继续启动...")
    
    # 检查是否在Docker容器中运行
    is_docker = os.path.exists('/.dockerenv')
    
    print(f"🚀 启动服务器 (端口: {PORT})...")
    
    try:
        uvicorn.run(
            "main:app",
            host="0.0.0.0",
            port=PORT,
            reload=not is_docker,  # Docker中禁用自动重载以提高性能
            log_level="info",
            access_log=True
        )
    except OSError as e:
        if "Address already in use" in str(e):
            print(f"\n❌ 端口 {PORT} 仍被占用！")
            print(f"请手动执行: lsof -ti :{PORT} | xargs kill -9")
            sys.exit(1)
        else:
            raise
