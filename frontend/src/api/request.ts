import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { message } from 'antd'

// 创建axios实例
const request: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器（无需认证）
request.interceptors.request.use(
  (config: AxiosRequestConfig) => {
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
request.interceptors.response.use(
  (response: AxiosResponse) => {
    const { data } = response
    // FastAPI直接返回数据，不需要额外的包装
    return data
  },
  (error) => {
    if (error.response) {
      const { status, data } = error.response
      const errorMessage = data?.detail || data?.message || '请求失败'
      
      switch (status) {
        case 401:
          message.error('请求未授权')
          break
        case 403:
          message.error('没有权限访问该资源')
          break
        case 404:
          message.error('请求的资源不存在')
          break
        case 422:
          // FastAPI验证错误
          const validationError = data?.detail?.[0]
          if (validationError) {
            message.error(`${validationError.loc?.join('.')} ${validationError.msg}`)
          } else {
            message.error(errorMessage)
          }
          break
        case 500:
          message.error('服务器错误')
          break
        default:
          message.error(errorMessage)
      }
    } else {
      message.error('网络连接失败')
    }
    return Promise.reject(error)
  }
)

export default request 