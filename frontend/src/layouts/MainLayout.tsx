import React from 'react'
import { Layout } from 'antd'

const { Content, Header } = Layout

const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <Layout style={{ minHeight: '100vh', width: '100%' }}>
      {/* 顶部Header */}
      <Header style={{ background: '#fff', padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', height: 56, borderBottom: '1px solid #f0f0f0', boxShadow: 'none', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
          <img src="/logo.png" alt="logo" style={{ height: 36, marginRight: 8 }} />
        </div>
      </Header>
      {/* 主体区域 */}
      <Content style={{ margin: 0, background: '#f7f8fa', minHeight: 'calc(100vh - 56px)', padding: 0, width: '100%' }}>
        {children}
      </Content>
    </Layout>
  )
}

export default MainLayout
