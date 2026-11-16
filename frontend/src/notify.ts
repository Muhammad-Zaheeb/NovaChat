/** Opt-in browser notifications and a subtle sound for messages that arrive while the window is not focused. */
const KEY = 'novachat-notify'

export const notificationsSupported = () => typeof Notification !== 'undefined'

export function notificationsOn(): boolean {
  try {
    return (
      localStorage.getItem(KEY) === 'on' &&
      notificationsSupported() &&
      Notification.permission === 'granted'
    )
  } catch {
    return false
  }
}

export async function setNotifications(on: boolean): Promise<boolean> {
  if (on) {
    if (!notificationsSupported()) return false
    const perm =
      Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission
    if (perm !== 'granted') return false
  }
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    /* ignore */
  }
  return true
}

let ctx: AudioContext | undefined
function beep() {
  try {
    ctx ??= new AudioContext()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.value = 880
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25)
    o.connect(g).connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.26)
  } catch {
    /* audio blocked */
  }
}

export function notifyMessage(title: string, body: string, onClick: () => void) {
  if (!notificationsOn()) return
  beep()
  try {
    const n = new Notification(title, { body, tag: title })
    n.onclick = () => {
      window.focus()
      onClick()
      n.close()
    }
  } catch {
    /* ignore */
  }
}
