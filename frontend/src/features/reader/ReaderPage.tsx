import { ChevronLeft, PanelLeft } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ApiError } from '../../shared/http'
import { useShellSidebar } from '../../shared/shellSidebar'
import { EmptyState } from '../../shared/ui/EmptyState'
import { ErrorState } from '../../shared/ui/ErrorState'
import { IconButton } from '../../shared/ui/IconButton'
import { useFileUrl } from './hooks'
import { PdfView, type PdfViewHandle } from './PdfView'
import styles from './Reader.module.css'
import { ReadingStrip } from './ReadingStrip'
import { ReaderPanel, type PanelTab } from './ReaderPanel'
import { useReaderLayout } from './useReaderLayout'

export type ReaderBack = { to: string; label: 'Back to chat' | 'Back to Library' }

type Props = {
  documentId: string
  filename?: string
  page: number
  /** sentences to mark on the page (the supporting sentences of the cited answer) */
  highlights: string[]
  /** the citation number, set whenever the Reader was opened from a citation (even one with no sentences to mark) */
  label?: number
  /** panels from the app (Task 8): the cited source (told whether the page lacks all or some of its marks) and the conversation */
  source?: (state: { missingOnPage: 'all' | 'some' | null }) => ReactNode
  chat?: ReactNode
  defaultTab?: PanelTab
  back: ReaderBack
}

/**
 * The Reader: the real PDF, opened at a page. Full window by default; the toolbar can open the app's sidebar.
 * The PDF link expires after 10 minutes: one silent renewal, then Try again.
 */
export function ReaderPage({ documentId, filename, page, highlights, label, source, chat, defaultTab = 'source', back }: Props) {
  const root = useRef<HTMLElement>(null)
  const layout = useReaderLayout(root)
  const [tab, setTab] = useState<PanelTab>(defaultTab)
  const [docked, setDocked] = useState(true)            // wide: the panel is open unless hidden
  const [sliding, setSliding] = useState(false)         // medium: the slide-over is closed until asked for
  const opener = useRef<HTMLButtonElement | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const [missing, setMissing] = useState<{ for: string[]; found: number; total: number; marks: { index: number; page: number }[] } | null>(null)
  // resets by itself when another citation is opened (the highlights array changes)
  const missingOnPage = missing?.for === highlights ? (missing.found === 0 ? 'all' : missing.found < missing.total ? 'some' : null) : null
  const pdf = useRef<PdfViewHandle>(null)
  const [stripHidden, setStripHidden] = useState(false)   // a tap on the page hides the strip, another brings it back
  const hasPanel = (!!source || !!chat) && layout !== 'phone'
  const showDocked = hasPanel && layout === 'wide' && docked
  const showSlide = hasPanel && layout === 'medium' && sliding
  const showButtons = hasPanel && (layout === 'medium' || !docked)

  function openPanel(t: PanelTab, button: HTMLButtonElement) {
    setTab(t)
    if (layout === 'wide') { setDocked(true); return }
    opener.current = button
    setSliding(true)
  }

  // aria-modal promises the rest is out of reach: Tab and Shift+Tab cycle inside the slide-over
  function trapTab(e: React.KeyboardEvent) {
    if (e.key !== 'Tab' || !dialog.current) return
    const items = [...dialog.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((el) => !el.closest('[hidden]'))
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  function closeSlide() {
    setSliding(false)
    opener.current?.focus()                              // focus goes back to the button that opened it
  }

  // the slide-over takes focus when it opens (it is modal: aria-modal)
  useEffect(() => {
    if (showSlide) dialog.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus()
  }, [showSlide])

  const file = useFileUrl(documentId)
  const sidebar = useShellSidebar()
  const [renewed, setRenewed] = useState(false)
  const [failed, setFailed] = useState(false)          // a second expiry, or a download that failed: Try again
  const [broken, setBroken] = useState(false)
  const [position, setPosition] = useState<{ page: number; total: number }>()
  // these belong to one document: a citation that opens another PDF starts clean (final review: a damaged
  // file made the next one look damaged too). Reset during render, so the panel and its tab stay as they are.
  const [stateFor, setStateFor] = useState(documentId)
  if (stateFor !== documentId) {
    setStateFor(documentId)
    setRenewed(false)
    setFailed(false)
    setBroken(false)
    setPosition(undefined)
  }
  // what screen readers hear: the page after a jump, and how many sentences are marked (never every page scrolled past)
  const [jumpNote, setJumpNote] = useState('')
  const [marksNote, setMarksNote] = useState('')

  const backLink = (
    <Link to={back.to} className={styles.back}><ChevronLeft size={18} aria-hidden="true" />{back.label}</Link>
  )

  function onExpired() {
    if (!renewed) { setRenewed(true); void file.refetch() }   // first time: quietly fetch a new link
    else setFailed(true)
  }

  function retry() {
    setFailed(false)
    setRenewed(false)
    void file.refetch()
  }

  let body: ReactNode
  if (file.isPending) {
    body = <p className={styles.status} aria-live="polite">Opening {filename ?? 'the document'}…</p>
  } else if (file.error instanceof ApiError && (file.error.kind === 'not_found' || file.error.kind === 'invalid')) {
    // invalid (422): the address holds something that is not a document id; trying again cannot help
    body = <EmptyState title="This document is no longer in your Library." action={backLink} />
  } else if (file.error) {
    body = (
      <ErrorState onRetry={retry}
        message={file.error instanceof ApiError && file.error.kind === 'network' ? "Can't reach the server" : "This PDF couldn't be loaded."} />
    )
  } else if (broken) {
    body = <EmptyState title="This PDF can't be shown here." action={backLink} />
  } else if (failed) {
    body = <ErrorState onRetry={retry}
      message={typeof navigator !== 'undefined' && navigator.onLine === false ? "Can't reach the server" : "This PDF couldn't be loaded."} />
  } else {
    body = (
      <PdfView ref={pdf} key={documentId} label={label} onTap={() => setStripHidden((h) => !h)} url={file.data.url} page={page} highlights={highlights} fit={layout === 'phone' ? 'column' : 'width'}
        onPageChange={(p, total, jumped) => { setPosition({ page: p, total }); if (jumped) setJumpNote(`Page ${p} of ${total}.`) }}
        onExpired={onExpired} onBroken={() => setBroken(true)} onFailed={() => setFailed(true)}
        onMarks={(found, total) => setMissing({ for: highlights, found: found.length, total, marks: found })}
        onMarksShown={(count) => setMarksNote(`${count} sentence${count === 1 ? '' : 's'} marked.`)} />
    )
  }

  // the phone reading strip: only for a citation, only while the PDF is shown, and for marks only once the page has reported
  const reported = missing?.for === highlights ? missing : null
  const stripState = highlights.length === 0 ? 'no-sentence' : reported ? (reported.marks.length === 0 ? 'none-on-page' : 'marks') : null
  const showStrip = layout === 'phone' && label !== undefined && !stripHidden && stripState !== null && !!file.data && !broken && !failed
  const stripSentences = reported ? reported.marks.map((m) => ({ index: m.index, text: highlights[m.index], page: m.page })) : []

  const sourceContent = source?.({ missingOnPage })

  return (
    <section ref={root} className={styles.reader} aria-label={filename ? `Reader: ${filename}` : 'Reader'}>
      <header className={styles.toolbar}>
        {sidebar.inReader && layout !== 'phone' && (
          <IconButton icon={PanelLeft} label={sidebar.open ? 'Hide sidebar' : 'Show sidebar'} aria-pressed={sidebar.open}
            className={styles.sidebarToggle} onClick={() => sidebar.setOpen(!sidebar.open)} />
        )}
        {backLink}
        <span className={styles.filename}>{filename}</span>
        {position && <span className={styles.counter} aria-hidden="true">{position.page} / {position.total}</span>}
        <span role="status" className={styles.srOnly}>{[jumpNote, marksNote].filter(Boolean).join(' ')}</span>
        {showButtons && (
          <span className={styles.panelButtons}>
            <button type="button" className={styles.panelButton} onClick={(e) => openPanel('source', e.currentTarget)}>Source</button>
            <button type="button" className={styles.panelButton} onClick={(e) => openPanel('chat', e.currentTarget)}>Chat</button>
          </span>
        )}
      </header>
      <div className={showDocked ? `${styles.body} ${styles.bodyWithPanel}` : styles.body}>
        {/* loading and error states sit in the middle; the PDF fills its column */}
        {file.data && !broken && !failed ? body : <div className={styles.stateBox}>{body}</div>}
        {showDocked && <aside className={styles.docked} aria-label="Source and chat"><ReaderPanel tab={tab} onTab={setTab} closeLabel="Hide panel" onClose={() => setDocked(false)} source={sourceContent} chat={chat} /></aside>}
      </div>
      {showStrip && <ReadingStrip key={highlights.join('\n')} label={label} sentences={stripSentences} state={stripState} onShow={(i) => pdf.current?.showSentence(i)} />}
      {showSlide && (
        <div className={styles.scrim} onClick={closeSlide}>
          <div ref={dialog} role="dialog" aria-modal="true" aria-label="Source and chat" className={styles.slide}
            onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') closeSlide(); else trapTab(e) }}>
            <ReaderPanel tab={tab} onTab={setTab} closeLabel="Close" onClose={closeSlide} source={sourceContent} chat={chat} />
          </div>
        </div>
      )}
    </section>
  )
}
