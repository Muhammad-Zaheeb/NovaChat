import type { ReactNode } from 'react'
import { Dialog } from './ui'

/** @deprecated use Dialog from ./ui */
export default function Modal(p: { title: string; onClose: () => void; children: ReactNode }) {
  return <Dialog {...p} />
}
