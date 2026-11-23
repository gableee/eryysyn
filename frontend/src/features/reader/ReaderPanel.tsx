import { ChevronsRight, X } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { IconButton } from '../../shared/ui/IconButton'
import styles from './Reader.module.css'

export type PanelTab = 'source' | 'chat'
type Props = {
  tab: PanelTab
  onTab(tab: PanelTab): void
  source: ReactNode
  chat: ReactNode
  /** docked: "Hide panel" (») · slide-over: "Close" (×) */
  closeLabel: 'Hide panel' | 'Close'
  onClose(): void
}

/** The Reader's side panel: tabs Source | Chat (Notes later). Both stay mounted, so a half-typed question survives a tab switch. */
export function ReaderPanel({ tab, onTab, source, chat, closeLabel, onClose }: Props) {
  const id = useId()
  const tabs: { key: PanelTab; label: string }[] = [{ key: 'source', label: 'Source' }, { key: 'chat', label: 'Chat' }]
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <div role="tablist" aria-label="Side panel" className={styles.tabs}>
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" id={`${id}-${t.key}-tab`} aria-controls={`${id}-${t.key}`}
              aria-selected={tab === t.key} tabIndex={tab === t.key ? 0 : -1}
              className={styles.tab} onClick={() => onTab(t.key)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
                const other: PanelTab = t.key === 'source' ? 'chat' : 'source'
                onTab(other)
                document.getElementById(`${id}-${other}-tab`)?.focus()   // focus moves with the selection (tab pattern)
              }}>
              {t.label}
            </button>
          ))}
        </div>
        <IconButton icon={closeLabel === 'Close' ? X : ChevronsRight} label={closeLabel} onClick={onClose} />
      </div>
      <div role="tabpanel" id={`${id}-source`} aria-labelledby={`${id}-source-tab`} hidden={tab !== 'source'} className={styles.panelBody}>{source}</div>
      <div role="tabpanel" id={`${id}-chat`} aria-labelledby={`${id}-chat-tab`} hidden={tab !== 'chat'} className={styles.panelBody}>{chat}</div>
    </div>
  )
}
