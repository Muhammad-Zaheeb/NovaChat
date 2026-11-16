import { useRef, useState, type ReactNode } from 'react'
import { Camera, LogOut, Monitor, Moon, Sun } from 'lucide-react'
import { authApi, errorMessage } from '../api'
import { displayName } from '../lib'
import { notificationsOn, notificationsSupported, setNotifications } from '../notify'
import { useAuth } from '../store/auth'
import { useOnboarding } from '../store/onboarding'
import { useTheme, type ThemePref } from '../store/theme'
import { toast } from '../store/toast'
import AvatarCropDialog from './AvatarCropDialog'
import PageHeader from './PageHeader'
import { Avatar, Button, Input, Kbd, Segmented, Switch, Textarea, modKey } from './ui'

function Card({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-line bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

const SHORTCUTS: [string[], string][] = [
  [[modKey, 'K'], 'Jump to a chat or friend'],
  [['Enter'], 'Send message'],
  [['Shift', 'Enter'], 'New line'],
  [['↑'], 'Edit your last message (empty message box)'],
  [['Esc'], 'Cancel reply or edit, close dialogs'],
]

/** Profile and settings: identity, appearance, notifications, help, account. */
export default function ProfileView() {
  const me = useAuth((s) => s.user)!
  const logout = useAuth((s) => s.logout)
  const [name, setName] = useState(me.display_name ?? '')
  const [bio, setBio] = useState(me.bio ?? '')
  const [busy, setBusy] = useState(false)
  const [notif, setNotif] = useState(notificationsOn())
  const pref = useTheme((s) => s.pref)
  const setPref = useTheme((s) => s.setPref)
  const onboardingDismissed = useOnboarding((s) => s.dismissed)
  const fileRef = useRef<HTMLInputElement>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const uploadAvatar = async (blob: Blob) => {
    try {
      useAuth.setState({ user: await authApi.setAvatar(blob) })
      setCropFile(null)
      toast('Profile picture updated', 'success')
    } catch (e) {
      toast(errorMessage(e, 'Could not upload picture'))
      throw e
    }
  }
  const removeAvatar = async () => {
    try {
      useAuth.setState({ user: await authApi.removeAvatar() })
      toast('Profile picture removed', 'success')
    } catch (e) {
      toast(errorMessage(e, 'Could not remove picture'))
    }
  }
  const dirty = name.trim() !== (me.display_name ?? '') || bio.trim() !== (me.bio ?? '')

  const save = async () => {
    setBusy(true)
    try {
      const u = await authApi.updateProfile({
        display_name: name.trim(),
        bio: bio.trim(),
      })
      useAuth.setState({ user: u })
      toast('Profile saved', 'success')
    } catch (e) {
      toast(errorMessage(e, 'Could not save profile'))
    } finally {
      setBusy(false)
    }
  }

  const toggleNotif = async (on: boolean) => {
    const ok = await setNotifications(on)
    if (!ok)
      toast('Notifications are blocked. Allow them in your browser’s site settings.')
    setNotif(ok ? on : false)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Settings" />
      {cropFile && (
        <AvatarCropDialog
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onSave={uploadAvatar}
        />
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <Card title="Profile" description="How you appear to friends and in groups.">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (dirty) void save()
              }}
            >
              <div className="flex items-center gap-4">
                <Avatar id={me.id} name={displayName(me)} size={72} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{displayName(me)}</div>
                  <div className="truncate text-sm text-muted">
                    @{me.username} · {me.email}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Camera}
                      onClick={() => fileRef.current?.click()}
                    >
                      {me.avatar_url ? 'Change picture' : 'Upload picture'}
                    </Button>
                    {me.avatar_url && (
                      <Button variant="danger-ghost" size="sm" onClick={() => void removeAvatar()}>
                        Remove
                      </Button>
                    )}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    aria-label="Choose profile picture"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      e.target.value = ''
                      if (!f) return
                      if (f.size > 5 * 1024 * 1024) toast('Pictures must be under 5 MB')
                      else setCropFile(f)
                    }}
                  />
                </div>
              </div>
              <Input
                label="Display name"
                value={name}
                maxLength={50}
                placeholder={me.username}
                hint="Leave empty to use your username."
                onChange={(e) => setName(e.target.value)}
              />
              <Textarea
                label="Bio"
                value={bio}
                maxLength={200}
                rows={3}
                aside={`${bio.length}/200`}
                placeholder="A line about you"
                onChange={(e) => setBio(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                {dirty && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setName(me.display_name ?? '')
                      setBio(me.bio ?? '')
                    }}
                  >
                    Discard
                  </Button>
                )}
                <Button type="submit" loading={busy} disabled={!dirty}>
                  Save changes
                </Button>
              </div>
            </form>
          </Card>

          <Card title="Appearance" description="System follows your device setting.">
            <Segmented<ThemePref>
              label="Theme"
              value={pref}
              onChange={setPref}
              options={[
                { value: 'light', label: 'Light', icon: Sun },
                { value: 'dark', label: 'Dark', icon: Moon },
                { value: 'system', label: 'System', icon: Monitor },
              ]}
            />
          </Card>

          <Card title="Notifications">
            <Switch
              label="Desktop notifications"
              description={
                notificationsSupported()
                  ? 'Show a notification and play a soft sound for new messages while NovaChat is in the background. Mute single chats from the chat header.'
                  : 'This browser does not support notifications.'
              }
              checked={notif}
              disabled={!notificationsSupported()}
              onChange={(v) => void toggleNotif(v)}
            />
          </Card>

          <Card title="Help">
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-subtle uppercase">
              Keyboard shortcuts
            </h3>
            <dl className="divide-y divide-line">
              {SHORTCUTS.map(([keys, what]) => (
                <div
                  key={what}
                  className="flex items-center justify-between gap-4 py-2 text-sm"
                >
                  <dt className="text-muted">{what}</dt>
                  <dd className="flex shrink-0 gap-1">
                    {keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
            {onboardingDismissed && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-4"
                onClick={() => {
                  useOnboarding.getState().reopen()
                  toast('The getting started guide is back in Chats', 'info')
                }}
              >
                Show getting started guide
              </Button>
            )}
          </Card>

          <Card title="Account">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">
                Signed in as <span className="font-medium text-fg">{me.email}</span>
              </p>
              <Button variant="secondary" icon={LogOut} onClick={() => void logout()}>
                Log out
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
