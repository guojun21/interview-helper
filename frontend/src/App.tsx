import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import InterviewNew from './pages/InterviewNew'
import InterviewMeeting from './pages/InterviewMeeting'

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/interview/meeting" element={<InterviewMeeting />} />
        <Route path="/interview/new" element={<MainLayout><InterviewNew /></MainLayout>} />
        <Route path="*" element={<Navigate to="/interview/new" replace />} />
      </Routes>
    </Router>
  )
}

export default App
