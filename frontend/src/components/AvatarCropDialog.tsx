import { useEffect, useRef, useState } from 'react'
import { Dialog, Button } from './ui'

const VIEW = 280 // crop window, CSS px
const OUT = 512 // exported size, px

/** Square crop: drag to move, slider (or wheel) to zoom. Exports a JPEG blob. */
export default function AvatarCropDialog({
  file,
  onCancel,
  onSave,
}: {
  file: File
  onCancel: () => void
  onSave: (blob: Blob) => Promise<void>
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [error, setError] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 }) // image centre offset from window centre
  const [busy, setBusy] = useState(false)
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    const i = new Image()
    i.onload = () => setImg(i)
    i.onerror = () => setError(true)
    i.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  const base = img ? VIEW / Math.min(img.naturalWidth, img.naturalHeight) : 1
  const scale = base * zoom
  const clamp = (p: { x: number; y: number }, z = zoom) => {
    if (!img) return p
    const w = img.naturalWidth * base * z
    const h = img.naturalHeight * base * z
    const mx = (w - VIEW) / 2
    const my = (h - VIEW) / 2
    return { x: Math.max(-mx, Math.min(mx, p.x)), y: Math.max(-my, Math.min(my, p.y)) }
  }
  const setZ = (z: number) => {
    setZoom(z)
    setPos((p) => clamp(p, z))
  }

  const save = async () => {
    if (!img) return
    setBusy(true)
    const c = document.createElement('canvas')
    c.width = c.height = OUT
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, OUT, OUT)
    const k = OUT / VIEW
    const w = img.naturalWidth * scale * k
    const h = img.naturalHeight * scale * k
    ctx.drawImage(img, OUT / 2 + pos.x * k - w / 2, OUT / 2 + pos.y * k - h / 2, w, h)
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.9))
    if (blob) await onSave(blob).catch(() => {})
    setBusy(false)
  }

  return (
    <Dialog
      title="Crop profile picture"
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={busy} disabled={!img}>
            Save picture
          </Button>
        </>
      }
    >
      {error ? (
        <p className="text-sm text-danger">This file could not be read as an image.</p>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div
            className="relative cursor-grab touch-none overflow-hidden rounded-full bg-surface-2 ring-2 ring-line active:cursor-grabbing"
            style={{ width: VIEW, height: VIEW }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }
            }}
            onPointerMove={(e) => {
              const d = drag.current
              if (d) setPos(clamp({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y }))
            }}
            onPointerUp={() => (drag.current = null)}
            onWheel={(e) => setZ(Math.min(4, Math.max(1, zoom - e.deltaY / 500)))}
          >
            {img && (
              <img
                src={img.src}
                alt="Drag to reposition"
                draggable={false}
                className="pointer-events-none absolute max-w-none select-none"
                style={{
                  width: img.naturalWidth * scale,
                  height: img.naturalHeight * scale,
                  left: VIEW / 2 + pos.x - (img.naturalWidth * scale) / 2,
                  top: VIEW / 2 + pos.y - (img.naturalHeight * scale) / 2,
                }}
              />
            )}
          </div>
          <label className="flex w-full items-center gap-3 text-sm text-muted">
            Zoom
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              onChange={(e) => setZ(Number(e.target.value))}
              className="flex-1 accent-(--color-accent)"
            />
          </label>
        </div>
      )}
    </Dialog>
  )
}
