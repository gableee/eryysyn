import { ChevronLeft, PanelLeft } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ApiError } from '../../shared/http'
import { useShellSidebar } from '../../shared/shellSidebar'
import { EmptyState } from '../../shared/ui/EmptyState'
import { ErrorState } from '../../shared/ui/ErrorState'
import { IconButton } from '../../shared/ui/IconButton'
import { useFileUrl } from './hooks'
import { PdfView } from './PdfView'
import styles from './Reader.module.css'

export type ReaderBack = { to: string; label: 'Back to chat' | 'Back to Library' }

type Props = {
  documentId: string
  filename?: string
  page: number
  /** sentences to mark on the page (the supporting sentences of the cited answer) */
  highlights: string[]
  /** panels from the app (Task 8): the cited source and the conversation */
  source?: ReactNode
  chat?: ReactNode
  back: ReaderBack
}

/**
 * The Reader: the real PDF, opened at a page. Full window by default; the toolbar can open the app's sidebar.
 * The PDF link expires after 10 minutes: one silent renewal, then Try again.
 */
export function ReaderPage({ documentId, filename, page, highlights, back }: Props) {
  const file = useFileUrl(documentId)
  const sidebar = useShellSidebar()
  const [renewed, setRenewed] = useState(false)
  const [expired, setExpired] = useState(false)
  const [broken, setBroken] = useState(false)
  const [position, setPosition] = useState<{ page: number; total: number }>()

  const backLink = (
    <Link to={back.to} className={styles.back}><ChevronLeft size={18} aria-hidden="true" />{back.label}</Link>
  )

  function onExpired() {
    if (!renewed) { setRenewed(true); void file.refetch() }   // first time: quietly fetch a new link
    else setExpired(true)
  }

  function retry() {
    setExpired(false)
    setRenewed(false)
    void file.refetch()
  }

  let body: ReactNode
  if (file.isPending) {
    body = <p className={styles.status} aria-live="polite">Opening {filename ?? 'the document'}…</p>
  } else if (file.error instanceof ApiError && file.error.kind === 'not_found') {
    body = <EmptyState title="This document is no longer in your Library." action={backLink} />
  } else if (file.error) {
    body = (
      <ErrorState onRetry={retry}
        message={file.error instanceof ApiError && file.error.kind === 'network' ? "Can't reach the server" : "This PDF couldn't be loaded."} />
    )
  } else if (broken) {
    body = <EmptyState title="This PDF can't be shown here." action={backLink} />
  } else if (expired) {
    body = <ErrorState message="This PDF couldn't be loaded." onRetry={retry} />
  } else {
    body = (
      <PdfView url={file.data.url} page={page} highlights={highlights}
        onPageChange={(p, total) => setPosition({ page: p, total })} onExpired={onExpired} onBroken={() => setBroken(true)} />
    )
  }

  return (
    <section className={styles.reader} aria-label={filename ? `Reader: ${filename}` : 'Reader'}>
      <header className={styles.toolbar}>
        {sidebar.inReader && (
          <IconButton icon={PanelLeft} label={sidebar.open ? 'Hide sidebar' : 'Show sidebar'} aria-pressed={sidebar.open}
            className={styles.sidebarToggle} onClick={() => sidebar.setOpen(!sidebar.open)} />
        )}
        {backLink}
        <span className={styles.filename}>{filename}</span>
        {position && (
          <span role="status" className={styles.counter}>
            <span aria-hidden="true">{position.page} / {position.total}</span>
            <span className={styles.srOnly}>Page {position.page} of {position.total}</span>
          </span>
        )}
      </header>
      <div className={styles.body}>{body}</div>
    </section>
  )
}
