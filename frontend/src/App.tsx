import { useEffect } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import VerifyPage from './pages/VerifyPage'
import AuthPage from './pages/AuthPage'
import NotFound from './components/NotFound'
import ChatPage from './pages/ChatPage'
import { useAuth } from './store/auth'

export default function App() {
  const restore = useAuth((s) => s.restore)
  useEffect(() => {
    void restore()
  }, [restore])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<ChatPage />} />
          <Route path="/c/:id" element={<ChatPage />} />
        </Route>
        <Route
          path="*"
          element={
            <div className="flex h-full">
              <NotFound />
            </div>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
