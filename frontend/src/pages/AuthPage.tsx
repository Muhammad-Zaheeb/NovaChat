import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { AtSign, Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { authApi, errorMessage } from '../api'
import AuthLayout, { FormNotice } from '../components/AuthLayout'
import { Button, IconButton, Input } from '../components/ui'
import { useAuth } from '../store/auth'

type Field = 'username' | 'email' | 'password'
const linkCls = 'font-medium text-accent-text underline-offset-4 hover:underline'

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const isRegister = mode === 'register'
  const { user, login, register } = useAuth()
  const navigate = useNavigate()
  const notice = (useLocation().state as { notice?: string } | null)?.notice
  const [values, setValues] = useState({ username: '', email: '', password: '' })
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({})
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/" replace />

  const { username, email, password } = values
  const errors: Partial<Record<Field, string>> = {}
  if (isRegister) {
    if (username.length < 3 || username.length > 50)
      errors.username = 'Use 3–50 characters'
    else if (!/^[A-Za-z0-9_]+$/.test(username))
      errors.username = 'Letters, digits and underscores only'
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = 'Enter a valid email address'
  if (isRegister && (password.length < 8 || password.length > 72))
    errors.password = 'Use 8–72 characters'
  else if (!password) errors.password = 'Enter your password'

  const set = (k: Field) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }))
  const blur = (k: Field) => () => setTouched((t) => ({ ...t, [k]: true }))
  const show = (k: Field) => (touched[k] ? errors[k] : undefined)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched({ username: true, email: true, password: true })
    if (Object.keys(errors).length) {
      const first = (['username', 'email', 'password'] as Field[]).find((k) => errors[k])
      document.getElementById(`auth-${first}`)?.focus()
      return
    }
    setError('')
    setBusy(true)
    try {
      if (isRegister) {
        await register(username, email, password)
        navigate('/verify', {
          replace: true,
          state: { email, notice: 'Account created. Enter the code we emailed you.' },
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
          state: { email, notice: 'Please verify your email to sign in.' },
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
    <AuthLayout
      title={isRegister ? 'Create your account' : 'Welcome back'}
      subtitle={
        isRegister
          ? 'It takes a minute. We will email you a code to confirm it is you.'
          : 'Sign in to pick up where you left off.'
      }
      footer={
        <>
          {isRegister ? 'Already have an account? ' : 'New to NovaChat? '}
          <Link to={isRegister ? '/login' : '/register'} className={linkCls}>
            {isRegister ? 'Sign in' : 'Create an account'}
          </Link>
          <p className="mt-3 text-xs text-subtle">
            Testing two accounts? Use a private window or a second browser.
          </p>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {notice && !error && <FormNotice kind="success">{notice}</FormNotice>}
        {error && <FormNotice kind="error">{error}</FormNotice>}
        {isRegister && (
          <Input
            id="auth-username"
            label="Username"
            icon={AtSign}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={set('username')}
            onBlur={blur('username')}
            error={show('username')}
            hint="This is how friends find you."
          />
        )}
        <Input
          id="auth-email"
          label="Email"
          type="email"
          icon={Mail}
          autoComplete="email"
          value={email}
          onChange={set('email')}
          onBlur={blur('email')}
          error={show('email')}
        />
        <Input
          id="auth-password"
          label="Password"
          type={showPw ? 'text' : 'password'}
          icon={Lock}
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          value={password}
          onChange={set('password')}
          onBlur={blur('password')}
          error={show('password')}
          hint={isRegister ? 'At least 8 characters.' : undefined}
          trailing={
            <IconButton
              label={showPw ? 'Hide password' : 'Show password'}
              icon={showPw ? EyeOff : Eye}
              size="sm"
              tooltip={false}
              active={showPw}
              onClick={() => setShowPw((s) => !s)}
            />
          }
        />
        <Button type="submit" size="lg" loading={busy} className="w-full">
          {isRegister ? 'Create account' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  )
}
