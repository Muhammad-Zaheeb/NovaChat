import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage, filesApi, type Attachment } from '../../api'
import { toast } from '../../store/toast'

export interface UploadItem {
  key: string
  name: string
  size: number
  isImage: boolean
  preview?: string
  progress: number
  status: 'uploading' | 'done' | 'error'
  error?: string
  att?: Attachment
}

const MB = 1024 * 1024
export const MAX_FILES = 10
const limitFor = (f: File) =>
  f.type.startsWith('image/') ? 10 * MB : f.type.startsWith('video/') ? 50 * MB : 25 * MB

/** Files staged in the composer. Each uploads right away, with progress, and can be cancelled. */
export function useUploads() {
  const [items, setItems] = useState<UploadItem[]>([])
  const aborts = useRef(new Map<string, AbortController>())
  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  })

  const patch = (key: string, p: Partial<UploadItem>) =>
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)))

  const start = useCallback((key: string, file: File) => {
    const ctl = new AbortController()
    aborts.current.set(key, ctl)
    filesApi
      .upload(file, file.name, {
        signal: ctl.signal,
        onProgress: (f) => patch(key, { progress: f }),
      })
      .then((att) => patch(key, { status: 'done', progress: 1, att }))
      .catch((e) => {
        if (ctl.signal.aborted) return
        patch(key, { status: 'error', error: errorMessage(e, 'Upload failed') })
      })
      .finally(() => aborts.current.delete(key))
  }, [])

  const add = useCallback(
    (files: File[]) => {
      const room = MAX_FILES - itemsRef.current.length
      if (files.length > room) toast(`You can attach up to ${MAX_FILES} files at once`)
      for (const f of files.slice(0, Math.max(room, 0))) {
        if (f.size > limitFor(f)) {
          toast(`${f.name} is too large (max ${limitFor(f) / MB} MB)`)
          continue
        }
        const key = crypto.randomUUID()
        const isImage = f.type.startsWith('image/')
        setItems((xs) => [
          ...xs,
          {
            key,
            name: f.name || 'file',
            size: f.size,
            isImage,
            preview: isImage ? URL.createObjectURL(f) : undefined,
            progress: 0,
            status: 'uploading',
          },
        ])
        start(key, f)
      }
    },
    [start],
  )

  const remove = useCallback((key: string) => {
    aborts.current.get(key)?.abort()
    setItems((xs) => {
      const x = xs.find((i) => i.key === key)
      if (x?.preview) URL.revokeObjectURL(x.preview)
      return xs.filter((i) => i.key !== key)
    })
  }, [])

  /** After sending: forget the items without cancelling anything. */
  const clear = useCallback(() => {
    itemsRef.current.forEach((x) => x.preview && URL.revokeObjectURL(x.preview))
    setItems([])
  }, [])

  // Leaving the chat cancels in-flight uploads.
  useEffect(() => {
    const map = aborts.current
    return () => map.forEach((c) => c.abort())
  }, [])

  return { items, add, remove, clear }
}
