import { memo, useEffect, useRef, type CSSProperties } from 'react'
import { TextLayer, type PdfDocument } from './pdf'
import styles from './Reader.module.css'

type Props = { doc: PdfDocument; n: number; scale: number; draw: boolean; width: number; height: number }

/**
 * One page's place in the column. Always there (so scrolling and page positions stay right); drawn only when
 * `draw` is true: a canvas (the picture), the PDF.js text layer (invisible, selectable, read by screen readers),
 * and an empty marks layer reserved for future highlights, pen and notes (positions relative to the page).
 */
export const PageSlot = memo(function PageSlot({ doc, n, scale, draw, width, height }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const text = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!draw) return
    let cancelled = false
    let renderTask: { cancel(): void } | undefined
    let textLayer: { cancel(): void } | undefined
    const textDiv = text.current
    void (async () => {
      const page = await doc.getPage(n)
      const c = canvas.current
      const context = c?.getContext('2d')
      if (cancelled || !c || !context) return
      const viewport = page.getViewport({ scale })
      const ratio = window.devicePixelRatio || 1             // sharp on high-density screens
      c.width = Math.floor(viewport.width * ratio)
      c.height = Math.floor(viewport.height * ratio)
      const task = page.render({ canvasContext: context, canvas: c, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] })
      renderTask = task
      await task.promise.catch(() => {})                     // cancelled when the page leaves the screen
      if (cancelled || !textDiv) return
      textDiv.replaceChildren()
      const layer = new TextLayer({ textContentSource: await page.getTextContent(), container: textDiv, viewport })
      textLayer = layer
      await layer.render()
    })()
    return () => {
      cancelled = true
      renderTask?.cancel()
      textLayer?.cancel()
      textDiv?.replaceChildren()
    }
  }, [doc, n, scale, draw])

  const style = { width, height, '--total-scale-factor': scale, '--scale-round-x': '1px', '--scale-round-y': '1px' } as CSSProperties
  return (
    <div data-page={n} className={styles.slot} style={style} role="group" aria-label={`Page ${n}`}>
      {draw && <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />}
      <div ref={text} className="textLayer" />
      <div className={styles.marksLayer} />
    </div>
  )
})
