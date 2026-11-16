import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { authApi, errorMessage } from '../api'
import { Button, Input } from '../components/ui'
import { useAuth } from '../store/auth'

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const isRegister = mode === 'register'
  const { user, login, register } = useAuth()
  const navigate = useNavigate()
  const notice = (useLocation().state as { notice?: string } | null)?.notice
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  const validate = () => {
    if (isRegister) {
      if (username.length < 3 || username.length > 50)
        return 'Username must be 3–50 characters'
      if (!/^[A-Za-z0-9_]+$/.test(username))
        return 'Username may contain only letters, digits and underscores'
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) return 'Enter a valid email address'
    if (isRegister && (password.length < 8 || password.length > 72))
      return 'Password must be 8–72 characters'
    if (!password) return 'Enter your password'
    return ''
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const v = validate()
    if (v) return setError(v)
    setError('')
    setBusy(true)
    try {
      if (isRegister) {
        await register(username, email, password)
        navigate('/verify', {
          replace: true,
          state: { email, notice: 'Account created — enter the code we emailed you' },
        })
        return
      }
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      if (
        !isRegister &&
        axios.isAxiosError(err) &&
        err.response?.status === 403 &&
        err.response.data?.detail === 'email_not_verified'
      ) {
        await authApi.resendCode(email).catch(() => {}) // may be rate limited: an earlier code still works
        navigate('/verify', {
          replace: true,
          state: { email, notice: 'Please verify your email to sign in' },
        })
        return
      }
      setError(
        errorMessage(err, isRegister ? 'Registration failed' : 'Login failed').replace(
          'Invalid credentials',
          'Incorrect email or password',
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-br from-brand-50 to-white p-4 dark:from-slate-900 dark:to-slate-950">
      <form
        onSubmit={submit}
        noValidate
        className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div>
          <h1 className="text-2xl font-bold text-brand-600 dark:text-indigo-400">
            NovaChat
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {isRegister ? 'Create your account' : 'Sign in to continue'}
          </p>
        </div>
        {isRegister && (
          <Input
            placeholder="Username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        )}
        <Input
          type="email"
          placeholder="Email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          type="password"
          placeholder="Password"
          value={password}
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          onChange={(e) => setPassword(e.target.value)}
        />
        {notice && !error && (
          <p
            role="status"
            className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-400"
          >
            {notice}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400"
          >
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
        </Button>
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          {isRegister ? 'Already have an account? ' : 'New here? '}
          <Link
            to={isRegister ? '/login' : '/register'}
            className="inline-block py-2 font-medium text-brand-600 dark:text-indigo-400 hover:underline"
          >
            {isRegister ? 'Sign in' : 'Create an account'}
          </Link>
        </p>
        <p className="text-center text-xs text-slate-400 dark:text-slate-500">
          To test two accounts, use a private window or another browser.
        </p>
      </form>
    </div>
  )
}
