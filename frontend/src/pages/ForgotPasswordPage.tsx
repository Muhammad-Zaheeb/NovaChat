import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, Lock, Mail } from 'lucide-react'
import axios from 'axios'
import { authApi, errorMessage } from '../api'
import AuthLayout, { FormNotice } from '../components/AuthLayout'
import { Button, IconButton, Input } from '../components/ui'

const emailOk = (v: string) => /^\S+@\S+\.\S+$/.test(v)

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const state = useLocation().state as { email?: string } | null
  const [step, setStep] = useState<'request' | 'reset'>('request')
  const [email, setEmail] = useState(state?.email ?? '')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const request = async (e: FormEvent) => {
    e.preventDefault()
    if (!emailOk(email)) return setError('Enter a valid email address')
    setError('')
    setBusy(true)
    try {
      await authApi.forgotPassword(email)
      setInfo('If that email has an account, we sent a 6-digit code. It expires in 15 minutes.')
      setStep('reset')
    } catch (err) {
      setError(errorMessage(err, 'Could not send the code'))
    } finally {
      setBusy(false)
    }
  }

  const reset = async (e: FormEvent) => {
    e.preventDefault()
    if (code.length !== 6) return setError('Enter all 6 digits of the code')
    if (password.length < 8 || password.length > 72) return setError('Use 8–72 characters for the password')
    setError('')
    setBusy(true)
    try {
      await authApi.resetPassword(email, code, password)
      navigate('/login', {
        replace: true,
        state: { email, notice: 'Password changed. Please sign in with your new password.' },
      })
    } catch (err) {
      const d = axios.isAxiosError(err) ? err.response?.data?.detail : ''
      setError(
        d === 'invalid_or_expired_code'
          ? 'That code is wrong or has expired. Check it, or request a new one.'
          : errorMessage(err, 'Could not change the password'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title={step === 'request' ? 'Reset your password' : 'Choose a new password'}
      subtitle={
        step === 'request'
          ? 'Enter your email and we will send you a code.'
          : 'Enter the code from your email and a new password. You will be signed out everywhere else.'
      }
      footer={
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 font-medium text-accent-text underline-offset-4 hover:underline"
        >
          <ArrowLeft size={14} aria-hidden /> Back to sign in
        </Link>
      }
    >
      {step === 'request' ? (
        <form onSubmit={request} noValidate className="space-y-4">
          {error && <FormNotice kind="error">{error}</FormNotice>}
          <Input
            label="Email"
            type="email"
            icon={Mail}
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" size="lg" loading={busy} className="w-full">
            Send code
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setStep('reset')}>
            I already have a code
          </Button>
        </form>
      ) : (
        <form onSubmit={reset} noValidate className="space-y-4">
          {info && !error && <FormNotice kind="success">{info}</FormNotice>}
          {error && <FormNotice kind="error">{error}</FormNotice>}
          <Input
            label="Email"
            type="email"
            icon={Mail}
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Reset code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="••••••"
            maxLength={6}
            value={code}
            aside={`${code.length}/6`}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className="h-12 text-center font-mono text-xl tracking-[0.5em] pointer-coarse:h-12"
          />
          <Input
            label="New password"
            type={showPw ? 'text' : 'password'}
            icon={Lock}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="At least 8 characters."
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
            Change password
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setStep('request')}>
            Send a new code
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
