import { useState } from 'react'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { useConfirmStore } from './helpers'

import type { ConfirmOptions } from './helpers'
export type { ConfirmOptions }

export function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger,
  onConfirm,
  onClose,
}: ConfirmOptions & { onClose: (confirmed: boolean) => void }) {
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    try {
      await onConfirm?.()
      onClose(true)
    } catch {
      setBusy(false)
    }
  }
  return (
    <Dialog
      role="alertdialog"
      size="sm"
      title={title}
      description={body}
      onClose={() => !busy && onClose(false)}
      hideClose
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => onClose(false)}
            disabled={busy}
            data-autofocus
          >
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => void go()}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  )
}

/** Mount once near the root. */
export function ConfirmHost() {
  const current = useConfirmStore((s) => s.current)
  if (!current) return null
  const { resolve, ...opts } = current
  return (
    <ConfirmDialog
      {...opts}
      onClose={(ok) => {
        useConfirmStore.setState({ current: null })
        resolve(ok)
      }}
    />
  )
}
