import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { authApi, errorMessage } from '../api'
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
    if (code.length !== 6) return setError('Enter the 6-digit code')
    setError('')
    setBusy(true)
    try {
      await authApi.verifyEmail(email, code)
      navigate('/login', {
        replace: true,
        state: { notice: 'Email verified — please sign in' },
      })
    } catch (err) {
      const d = axios.isAxiosError(err) ? err.response?.data?.detail : ''
      setError(
        d === 'invalid_or_expired_code'
          ? 'That code is wrong or has expired. Check the code or request a new one.'
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
    <div className="flex h-full items-center justify-center bg-gradient-to-br from-brand-50 to-white p-4 dark:from-slate-900 dark:to-slate-950">
      <form
        onSubmit={submit}
        noValidate
        className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div>
          <h1 className="text-2xl font-bold text-brand-600 dark:text-indigo-400">
            Verify your email
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {state?.email
              ? `We sent a 6-digit code to ${state.email}. It expires in 10 minutes.`
              : 'Enter the 6-digit code we emailed you.'}
          </p>
        </div>
        {!state?.email && (
          <Input
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
        <Input
          aria-label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="123456"
          maxLength={6}
          value={code}
          onChange={(e) => onCode(e.target.value)}
          onPaste={(e) => {
            e.preventDefault()
            onCode(e.clipboardData.getData('text'))
          }}
          className="text-center text-xl tracking-[0.5em]"
        />
        {info && !error && (
          <p
            role="status"
            className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-400"
          >
            {info}
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
          {busy ? 'Verifying…' : 'Verify'}
        </Button>
        <button
          type="button"
          onClick={resend}
          disabled={wait > 0}
          className="block w-full py-2 text-center text-sm font-medium text-brand-600 hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60 dark:text-indigo-400"
        >
          {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
        </button>
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          <Link to="/login" className="inline-block py-2 hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </div>
  )
}
