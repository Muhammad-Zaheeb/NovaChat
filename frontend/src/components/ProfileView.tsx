import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authApi, errorMessage } from '../api'
import { notificationsOn, notificationsSupported, setNotifications } from '../notify'
import { useAuth } from '../store/auth'
import { toast } from '../store/toast'
import { Avatar, Button, Input } from './ui'

/** Profile and settings: display name, bio, notifications. */
export default function ProfileView() {
  const me = useAuth((s) => s.user)!
  const [name, setName] = useState(me.display_name ?? '')
  const [bio, setBio] = useState(me.bio ?? '')
  const [busy, setBusy] = useState(false)
  const [notif, setNotif] = useState(notificationsOn())

  const save = async () => {
    setBusy(true)
    try {
      const u = await authApi.updateProfile({
        display_name: name.trim(),
        bio: bio.trim(),
      })
      useAuth.setState({ user: u })
      toast('Profile saved', 'info')
    } catch (e) {
      toast(errorMessage(e, 'Could not save profile'))
    } finally {
      setBusy(false)
    }
  }

  const toggleNotif = async (on: boolean) => {
    const ok = await setNotifications(on)
    if (!ok) toast('Notifications are blocked in your browser settings')
    setNotif(ok ? on : false)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <Link to="/" aria-label="Back to chats" className="md:hidden">
          ←
        </Link>
        <h2 className="font-semibold">Profile &amp; settings</h2>
      </header>
      <div className="mx-auto max-w-md space-y-4 p-4">
        <div className="flex items-center gap-3">
          <Avatar name={me.username} size={56} />
          <div>
            <div className="font-semibold">{me.display_name || me.username}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              @{me.username}
            </div>
          </div>
        </div>
        <label className="block text-sm font-medium">
          Display name
          <Input
            value={name}
            maxLength={50}
            placeholder={me.username}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium">
          Bio
          <textarea
            value={bio}
            maxLength={200}
            rows={3}
            onChange={(e) => setBio(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base outline-none focus:border-brand-500 md:text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <span className="text-xs text-slate-500">{bio.length}/200</span>
        </label>
        <Button onClick={() => void save()} disabled={busy}>
          Save profile
        </Button>
        <hr className="border-slate-200 dark:border-slate-800" />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={notif}
            disabled={!notificationsSupported()}
            onChange={(e) => void toggleNotif(e.target.checked)}
          />
          Desktop notifications and a sound for new messages when this window is not
          focused
        </label>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Mute individual conversations from the chat header.
        </p>
      </div>
    </div>
  )
}
