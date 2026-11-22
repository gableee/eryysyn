/** Sample data for /dev/states (development only): every Library state, no network. */
import { registerStates } from '../../app/devStates'
import { DocumentRow } from './DocumentRow'
import { EmptyLibrary } from './EmptyLibrary'
import styles from './Library.module.css'
import { UploadZone } from './UploadZone'

const noop = () => {}
const base = { created_at: '2026-11-22T10:00:00Z' }

registerStates('Library · first visit (empty)', () => (
  <EmptyLibrary upload={<UploadZone onFile={noop} disabled={false} />} />
))
registerStates('Library · upload zone, file refused', () => (
  <UploadZone onFile={noop} disabled={false} error="Only PDF files for now." />
))
registerStates('Library · upload zone while uploading (disabled)', () => (
  <UploadZone onFile={noop} disabled />
))
registerStates('Library · every row state', () => (
  <ul className={styles.list}>
    <DocumentRow doc={{ filename: 'Cardio lecture 3.pdf', status: 'uploading' }} />
    <DocumentRow doc={{ ...base, id: '1', filename: 'Vital Signs, ch. 12.pdf', status: 'indexed' }} onDelete={noop} />
    <DocumentRow doc={{ ...base, id: '2', filename: 'Scanned handout.pdf', status: 'failed' }} onRetry={noop} onDelete={noop} />
    <DocumentRow doc={{ ...base, id: '3', filename: 'Pharmacology lecture 7 – antihypertensives, beta blockers, ACE inhibitors and diuretics (final version, revised).pdf', status: 'indexed' }} onDelete={noop} />
  </ul>
))
