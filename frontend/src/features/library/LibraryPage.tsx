import { AnimatePresence } from 'motion/react'
import { useState } from 'react'
import { ApiError } from '../../shared/http'
import { ErrorState } from '../../shared/ui/ErrorState'
import { DocumentRow } from './DocumentRow'
import { EmptyLibrary } from './EmptyLibrary'
import { useDelete, useDocuments, useRetry, useUpload } from './hooks'
import styles from './Library.module.css'
import { UploadZone } from './UploadZone'
import { validateFile } from './validateFile'

/** Server errors in the same plain words as the browser-side checks. */
function uploadMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Upload failed. Try again.'
  if (error.kind === 'too_large') return 'This file is over 20 MB.'
  if (error.kind === 'unsupported') return 'Only PDF files for now.'
  if (error.kind === 'network') return "Can't reach the server"
  return 'Upload failed. Try again.'
}

export function LibraryPage() {
  const documents = useDocuments()
  const upload = useUpload()
  const retry = useRetry()
  const remove = useDelete()
  const [fileError, setFileError] = useState<string>()

  function choose(file: File) {
    const problem = validateFile(file)
    setFileError(problem ?? undefined)
    if (problem) return
    upload.mutate(file, { onError: (e) => setFileError(uploadMessage(e)) })
  }

  const zone = <UploadZone onFile={choose} disabled={upload.isPending} error={fileError} />
  const docs = documents.data ?? []
  const uploading = upload.isPending && upload.variables ? upload.variables.name : null

  return (
    <section className={styles.page} aria-busy={documents.isLoading || undefined}>
      <header className={styles.header}>
        <h1>Library</h1>
        <p className={styles.sub}>Your documents. Only you can see them.</p>
      </header>

      {documents.isError ? (
        <ErrorState
          message={documents.error instanceof ApiError && documents.error.kind === 'network'
            ? "Can't reach the server" : "Your documents couldn't be loaded."}
          onRetry={() => documents.refetch()} />
      ) : documents.isLoading ? (
        <ul className={styles.list} aria-label="Loading documents">
          {[0, 1, 2].map((i) => <li key={i} className={`${styles.row} ${styles.skeleton}`} />)}
        </ul>
      ) : docs.length === 0 && !uploading ? (
        <EmptyLibrary upload={zone} />
      ) : (
        <>
          {zone}
          {remove.isError && <ErrorState message="That document couldn't be deleted. Try again." />}
          <ul className={styles.list} aria-label="Your documents">
            <AnimatePresence initial={false}>
              {uploading && <DocumentRow key="uploading" doc={{ filename: uploading, status: 'uploading' }} />}
              {docs.map((d) => (
                <DocumentRow key={d.id} doc={d}
                  busy={retry.isPending && retry.variables === d.id}
                  onRetry={() => retry.mutate(d.id)}
                  onDelete={() => remove.mutate(d.id)} />
              ))}
            </AnimatePresence>
          </ul>
        </>
      )}
    </section>
  )
}
