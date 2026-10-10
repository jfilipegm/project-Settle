import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import styles from './Dialog.module.css'

/**
 * A modal dialog (M4 plan, H14): the native `<dialog>` opened with
 * `showModal()`, a sheet from the bottom under 640 px and a centred card
 * from 640 px, raised. Its title names it; Escape or a click outside it
 * (on the backdrop) closes it; focus returns to what had it before. Where `showModal` is missing (older browsers,
 * jsdom) it falls back to the `open` attribute.
 */
export function Dialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: ReactNode
  /**
   * Escape, a click on the backdrop, or the dialog's own Cancel: the parent
   * sets `open` false.
   */
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const returnFocus = useRef<HTMLElement | null>(null)
  // Where the press began: a press that starts inside (selecting text, say)
  // and ends on the backdrop doesn't close the dialog.
  const pressedBackdrop = useRef(false)

  useEffect(() => {
    const dialog = ref.current
    if (dialog === null) return
    if (open && !dialog.open) {
      returnFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
      // The first field, or else the dialog itself.
      const first = dialog.querySelector<HTMLElement>(
        'input, select, textarea, button',
      )
      ;(first ?? dialog).focus()
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
      returnFocus.current?.focus()
      returnFocus.current = null
    }
  }, [open])

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      // The content fills the <dialog> box, so only the backdrop's presses
      // land on the element itself.
      onPointerDown={(event) => {
        pressedBackdrop.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        const backdrop =
          pressedBackdrop.current && event.target === event.currentTarget
        pressedBackdrop.current = false
        if (backdrop) onClose()
      }}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      tabIndex={-1}
    >
      {open && (
        <div className={styles.content}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {children}
        </div>
      )}
    </dialog>
  )
}
