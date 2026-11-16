import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { ArrowLeft, Mail, RotateCw } from 'lucide-react'
import { authApi, errorMessage } from '../api'
import AuthLayout, { FormNotice } from '../components/AuthLayout'
import { Button, Input } from '../components/ui'

const COOLDOWN = 60

export default function VerifyPage() {
  const navigate = useNavigate()
  const state = useLocation().state as { email?: string; notice?: string } | null
  const [email, setEmail] = useState(state?.email ?? '')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState(state?.notice ?? '')
  const [busy, setBusy] = useState(false)
  // A code was just emailed when we arrive here, so the resend cooldown is already running.
  const [wait, setWait] = useState(state?.email ? COOLDOWN : 0)

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const onCode = (v: string) => setCode(v.replace(/\D/g, '').slice(0, 6))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email address')
    if (code.length !== 6) return setError('Enter all 6 digits of the code')
    setError('')
    setBusy(true)
    try {
      await authApi.verifyEmail(email, code)
      navigate('/login', {
        replace: true,
        state: { notice: 'Email verified. Please sign in.' },
      })
    } catch (err) {
      const d = axios.isAxiosError(err) ? err.response?.data?.detail : ''
      setError(
        d === 'invalid_or_expired_code'
          ? 'That code is wrong or has expired. Check it, or request a new one.'
          : errorMessage(err, 'Verification failed'),
      )
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter a valid email address')
    setError('')
    try {
      await authApi.resendCode(email)
      setInfo('A new code is on its way.')
      setCode('')
    } catch (err) {
      const d = axios.isAxiosError(err) ? err.response?.data?.detail : ''
      setError(
        d === 'too_many_codes'
          ? 'Too many codes requested. Try again in an hour.'
          : d === 'wait_before_resend'
            ? 'Please wait a minute before requesting another code.'
            : errorMessage(err, 'Could not resend the code'),
      )
    }
    setWait(COOLDOWN)
  }

  return (
    <AuthLayout
      title="Check your email"
      subtitle={
        state?.email ? (
          <>
            We sent a 6-digit code to{' '}
            <span className="font-medium text-fg">{state.email}</span>. It expires in 10
            minutes.
          </>
        ) : (
          'Enter the 6-digit code we emailed you.'
        )
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
      <form onSubmit={submit} noValidate className="space-y-4">
        {info && !error && <FormNotice kind="success">{info}</FormNotice>}
        {error && <FormNotice kind="error">{error}</FormNotice>}
        {!state?.email && (
          <Input
            label="Email"
            type="email"
            icon={Mail}
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
        <Input
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="••••••"
          maxLength={6}
          value={code}
          aside={`${code.length}/6`}
          onChange={(e) => onCode(e.target.value)}
          onPaste={(e) => {
            e.preventDefault()
            onCode(e.clipboardData.getData('text'))
          }}
          className="h-12 text-center font-mono text-xl tracking-[0.5em] pointer-coarse:h-12"
        />
        <Button type="submit" size="lg" loading={busy} className="w-full">
          Verify email
        </Button>
        <Button
          variant="ghost"
          icon={RotateCw}
          onClick={() => void resend()}
          disabled={wait > 0}
          className="w-full"
        >
          {wait > 0 ? (
            <>
              Resend code in <span className="tabular-nums">{wait}s</span>
            </>
          ) : (
            'Resend code'
          )}
        </Button>
      </form>
    </AuthLayout>
  )
}
