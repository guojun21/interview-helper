// AudioWorklet 处理器
// 用于实时处理音频数据

class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // 640 samples = 40ms @ 16kHz (讯飞要求每40ms发送一次)
    this.bufferSize = 640;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    // 总是处理固定块大小 (128 samples)
    const blockSize = 128; // Web Audio 标准块大小
    const inputChannel = new Float32Array(blockSize);
    
    if (inputs.length > 0 && inputs[0].length > 0) {
      // 有音频数据，复制第一个声道
      inputs[0][0].forEach((sample, i) => {
        inputChannel[i] = sample;
      });
    } else {
      // 无音频数据，填充零
      console.warn('⚠️ 无音频输入，填充零样本');
    }
    
    // 积累到 buffer
    for (let i = 0; i < blockSize; i++) {
      this.buffer[this.bufferIndex++] = inputChannel[i];
      
      if (this.bufferIndex >= this.bufferSize) {
        // 转换为 Int16Array (PCM 16bit)
        const pcmData = new Int16Array(this.bufferSize);
        for (let j = 0; j < this.bufferSize; j++) {
          pcmData[j] = Math.max(-32768, Math.min(32767, this.buffer[j] * 32768));
        }
        
        // 发送到主线程
        this.port.postMessage({
          type: 'audio',
          data: pcmData.buffer
        }, [pcmData.buffer]);
        
        this.bufferIndex = 0;
      }
    }
    
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);

