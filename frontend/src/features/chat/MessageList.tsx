import { Fragment } from 'react'
import { AnswerMessage } from './AnswerMessage'
import styles from './Chat.module.css'
import { SourcesPanel } from './SourcesPanel'
import type { ChatMessage } from './types'
import { UserMessage } from './UserMessage'

type Props = {
  messages: ChatMessage[]
  layout: 'panel' | 'inline'
  selectedId: string | undefined
  activeN: number | undefined
  activeClaim?: number
  conversationId?: string
  onSelect(answerId: string, n: number, k: number): void
}

/** role="log": screen readers announce new messages politely, in order. */
export function MessageList({ messages, layout, selectedId, activeN, activeClaim, conversationId, onSelect }: Props) {
  return (
    <div className={styles.messages} role="log" aria-label="Conversation">
      {messages.map((m) => (
        <Fragment key={m.id}>
          {m.role === 'user'
            ? <UserMessage text={m.content} searchQuestion={m.search_question} />
            : (
              <div className={styles.answerBlock}>
                <AnswerMessage message={m} activeN={m.id === selectedId ? activeN : undefined}
                  onSelectCitation={(n, k) => onSelect(m.id, n, k)} />
                {layout === 'inline' && m.citations.length > 0 && (
                  <SourcesPanel citations={m.citations} activeN={m.id === selectedId ? activeN : undefined} layout="inline"
                    answer={m} conversationId={conversationId} activeClaim={m.id === selectedId ? activeClaim : undefined} />
                )}
              </div>
            )}
        </Fragment>
      ))}
    </div>
  )
}
