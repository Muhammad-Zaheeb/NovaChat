import { Fragment } from 'react'

const URL_RE = /https?:\/\/[^\s<>]+/g
const TRAILING = /[.,!?;:)\]}'"]+$/

/** Renders text with http(s) URLs as links. Plain React text nodes, never raw HTML. */
export default function Linkify({ text }: { text: string }) {
  const out: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index
    let url = m[0]
    const trail = url.match(TRAILING)?.[0] ?? ''
    if (trail) url = url.slice(0, -trail.length)
    if (start > last) out.push(text.slice(last, start))
    out.push(
      <a
        key={start}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2"
      >
        {url}
      </a>,
    )
    last = start + url.length
  }
  out.push(text.slice(last))
  return out.map((n, i) => <Fragment key={i}>{n}</Fragment>)
}
