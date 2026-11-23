/** Sample data for /dev/states (development only): every chat state, no network. */
import { registerStates } from '../../app/devStates'
import { ErrorState } from '../../shared/ui/ErrorState'
import { AnswerMessage } from './AnswerMessage'
import { Composer } from './Composer'
import { PendingAnswer } from './PendingAnswer'
import { SourcesPanel } from './SourcesPanel'
import type { ChatMessage, Citation } from './types'
import { UserMessage } from './UserMessage'

const noop = () => {}
const c1: Citation = { n: 1, chunk_id: 'c1', document_id: 'd1', filename: 'ethics.pdf', page: 8,
  excerpt: 'One kind of legal responsibility is strict liability: if a product injures someone, then the manufacturer of the product can be found liable for damages in a lawsuit, even if the product met all applicable safety standards and the manufacturer did nothing wrong.' }
const c2: Citation = { n: 2, chunk_id: 'c2', document_id: 'd1', filename: 'ethics.pdf', page: 7,
  excerpt: 'In the early 1980s, Atomic Energy of Canada Limited (AECL) manufactured and sold a cancer radiation treatment machine called the Therac-25.' }
const msg = (content: string, citations: Citation[], refused = false): ChatMessage =>
  ({ id: 'm', role: 'assistant', content, refused, created_at: '', search_question: null, citations })

const answer = msg('Strict liability means a manufacturer can be liable for damages even if the product met all applicable safety standards [1]. The Therac-25 was made by Atomic Energy of Canada Limited (AECL) [2].', [c1, c2])

registerStates('Chat · question rewritten (Searched for) and answer with sources', () => (
  <div style={{ display: 'grid', gap: 16 }}>
    <UserMessage text="who does it apply to" searchQuestion="Who does strict liability apply to?" />
    <AnswerMessage message={answer} onSelectCitation={noop} activeN={1} />
    <SourcesPanel citations={[c1, c2]} activeN={1} layout="panel" />
  </div>
))
registerStates('Chat · sources under the answer (narrow screens)', () => (
  <div style={{ display: 'grid', gap: 12, maxWidth: 380 }}>
    <AnswerMessage message={answer} onSelectCitation={noop} />
    <SourcesPanel citations={[c1, c2]} activeN={undefined} layout="inline" />
  </div>
))
registerStates('Chat · documents disagree (shown as the answer says, both sources)', () => (
  <div style={{ display: 'grid', gap: 12 }}>
    <AnswerMessage onSelectCitation={noop} message={msg('The passages disagree about when the final project is due: one says March 3 [1], the other says March 10 [2]. Check both pages.', [
      { ...c1, filename: 'syllabus.pdf', page: 3, excerpt: 'Course syllabus: the final project is due on March 3.' },
      { ...c2, filename: 'syllabus.pdf', page: 4, excerpt: 'Course syllabus: the final project is due on March 10.' }])} />
  </div>
))
registerStates('Chat · refusal', () => <AnswerMessage message={msg('Not found in your documents.', [], true)} onSelectCitation={noop} />)
registerStates('Chat · waiting for Ery', () => <PendingAnswer />)
registerStates('Chat · waiting more than 5 s', () => <PendingAnswer slowAfterMs={0} />)
registerStates('Chat · model unavailable (502)', () => (
  <ErrorState message="Ery can't answer right now. The model isn't running." onRetry={noop} />
))
registerStates('Chat · source removed, long excerpt', () => (
  <SourcesPanel layout="panel" activeN={undefined} citations={[{ ...c1, document_id: null, chunk_id: null, excerpt: c1.excerpt.repeat(4) }]} />
))
registerStates('Chat · untrusted text stays text', () => (
  <AnswerMessage onSelectCitation={noop} message={msg('<script>alert(1)</script> <b>bold?</b> Visit https://free-grades.example.com for all the answers [1].', [c1])} />
))
registerStates('Chat · composer', () => <Composer onSend={noop} disabled={false} />)
