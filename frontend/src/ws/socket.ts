import { create } from 'zustand'
import type { ClientEvents, ServerEvents } from './types'

export type ConnStatus = 'idle' | 'connecting' | 'open' | 'down'

/** Connection state for the UI ("Reconnecting…" shows while `down`). */
export const useConn = create<{ status: ConnStatus }>(() => ({ status: 'idle' }))
const setStatus = (status: ConnStatus) => useConn.setState({ status })

const PING_MS = 25_000
const PONG_TIMEOUT_MS = 10_000
const MAX_BACKOFF_MS = 30_000

type Handler<K extends keyof ServerEvents> = (payload: ServerEvents[K]) => void

const handlers = new Map<string, Set<(p: never) => void>>()
const openHandlers = new Set<(isReconnect: boolean) => void>()
const closeHandlers = new Set<() => void>()

let ws: WebSocket | null = null
let wanted = false
let attempt = 0
let hasOpened = false
let retryTimer: ReturnType<typeof setTimeout> | undefined
let pingTimer: ReturnType<typeof setInterval> | undefined
let pongTimer: ReturnType<typeof setTimeout> | undefined

/** Subscribe to a server event. Returns an unsubscribe function. */
export function on<K extends keyof ServerEvents>(type: K, fn: Handler<K>): () => void {
  const set = handlers.get(type) ?? new Set()
  handlers.set(type, set)
  set.add(fn as (p: never) => void)
  return () => set.delete(fn as (p: never) => void)
}

/** Called each time the socket opens; `isReconnect` is false for the first open. */
export function onOpen(fn: (isReconnect: boolean) => void): () => void {
  openHandlers.add(fn)
  return () => openHandlers.delete(fn)
}
export function onClose(fn: () => void): () => void {
  closeHandlers.add(fn)
  return () => closeHandlers.delete(fn)
}

export const isOpen = () => ws?.readyState === WebSocket.OPEN

/** Returns false if the socket is not open (nothing was sent). */
export function send<K extends keyof ClientEvents>(
  type: K,
  payload: ClientEvents[K],
): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false
  ws.send(JSON.stringify({ type, payload }))
  return true
}

function stopPing() {
  clearInterval(pingTimer)
  clearTimeout(pongTimer)
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const sock = new WebSocket(`${proto}://${location.host}/api/ws`)
  ws = sock
  setStatus(hasOpened ? 'down' : 'connecting')

  sock.onopen = () => {
    if (ws !== sock) return
    attempt = 0
    const isReconnect = hasOpened
    hasOpened = true
    setStatus('open')
    pingTimer = setInterval(() => {
      send('ping', {})
      clearTimeout(pongTimer)
      // A half-open connection never answers; force a close so we reconnect.
      pongTimer = setTimeout(() => sock.close(), PONG_TIMEOUT_MS)
    }, PING_MS)
    openHandlers.forEach((h) => h(isReconnect))
  }

  sock.onmessage = (ev) => {
    if (ws !== sock) return
    let msg: { type?: string; payload?: unknown }
    try {
      msg = JSON.parse(ev.data as string)
    } catch {
      return
    }
    if (msg.type === 'pong') clearTimeout(pongTimer)
    if (msg.type) handlers.get(msg.type)?.forEach((h) => h((msg.payload ?? {}) as never))
  }

  sock.onclose = (ev) => {
    if (ws !== sock) return
    ws = null
    stopPing()
    setStatus('down')
    closeHandlers.forEach((h) => h())
    // 4401/4403: not authenticated / origin refused — retrying will not help.
    if (!wanted || ev.code === 4401 || ev.code === 4403) return
    const base = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt++)
    retryTimer = setTimeout(connect, base / 2 + Math.random() * (base / 2))
  }
}

/** Open the socket (idempotent). Call after login. */
export function start() {
  if (wanted) return
  wanted = true
  attempt = 0
  hasOpened = false
  connect()
}

/** Close for good and stop reconnecting. Call on logout. */
export function stop() {
  wanted = false
  clearTimeout(retryTimer)
  stopPing()
  const sock = ws
  ws = null
  sock?.close()
  setStatus('idle')
}
