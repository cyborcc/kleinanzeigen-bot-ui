'use client';

import {
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  type ReactElement,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.scss';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  maxWidth?: number;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
  maxWidth,
}: ModalProps): ReactElement | null {
  const contentRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Handle Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  // Focus trap
  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement;
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    // Focus the close button on open
    const firstFocusable = contentRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    firstFocusable?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      previousFocusRef.current?.focus();
    };
  }, [open, handleKeyDown]);

  // Trap focus within modal
  useEffect(() => {
    if (!open) return;

    function handleTab(e: KeyboardEvent): void {
      if (e.key !== 'Tab' || !contentRef.current) return;

      const focusable = contentRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [open]);

  function handleOverlayClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) onClose();
  }

  if (!open) return null;

  const contentClasses = [styles.content, wide && styles.contentWide]
    .filter(Boolean)
    .join(' ');

  return createPortal(
    <div className={styles.modal} role="dialog" aria-modal="true" aria-label={title}>
      <div className={styles.overlay} onClick={handleOverlayClick} />
      <div ref={contentRef} className={contentClasses} style={maxWidth ? { maxWidth: `${maxWidth}px` } : undefined}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button
            type="button"
            className="modalCloseBtn"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Let the user select the safe follow-up action for an old listing before a
 * repost is queued.  This stays imperative like showConfirm so menu hooks can
 * use it without adding modal state to every card/table view.
 */
export function showRepostActionPicker(): Promise<'delete' | 'keep' | 'reserve' | 'deactivate' | null> {
  return new Promise((resolve) => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    let closed = false;
    function cleanup(result: 'delete' | 'keep' | 'reserve' | 'deactivate' | null): void {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      resolve(result);
      container.remove();
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:var(--z-modal);display:flex;align-items:center;justify-content:center;';
    const bg = document.createElement('div');
    bg.style.cssText = 'position:absolute;inset:0;background-color:var(--bg-overlay);';
    bg.addEventListener('click', () => cleanup(null));
    overlay.appendChild(bg);

    const content = document.createElement('div');
    content.className = styles.content;
    const header = document.createElement('div');
    header.className = styles.header;
    const title = document.createElement('h2');
    title.className = styles.title;
    title.textContent = 'Altes Inserat nach Neuveröffentlichung';
    header.appendChild(title);
    content.appendChild(header);

    const body = document.createElement('div');
    body.className = styles.body;
    const message = document.createElement('p');
    message.className = styles.confirmMessage;
    message.textContent = 'Die Folgeaktion wird nur ausgeführt, wenn die Neuveröffentlichung erfolgreich war.';
    body.appendChild(message);
    const label = document.createElement('label');
    label.textContent = 'Aktion für das alte Inserat';
    label.style.cssText = 'display:block;margin-top:var(--space-3);margin-bottom:var(--space-1);font-size:var(--font-size-sm);font-weight:var(--font-semibold);';
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Aktion für das alte Inserat');
    select.style.cssText = 'width:100%;min-height:40px;padding:0 var(--space-2);border:1px solid var(--border-color);border-radius:var(--radius-md);background:var(--bg-secondary);color:var(--text-primary);font:inherit;';
    const options: Array<[string, string]> = [
      ['delete', 'Altes Inserat löschen'],
      ['keep', 'Altes Inserat behalten'],
      ['reserve', 'Altes Inserat reservieren'],
      ['deactivate', 'Altes Inserat deaktivieren (reservieren)'],
    ];
    for (const [value, text] of options) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      select.appendChild(option);
    }
    select.value = 'reserve';
    label.htmlFor = 'repost-after-action';
    select.id = 'repost-after-action';
    body.appendChild(label);
    body.appendChild(select);
    content.appendChild(body);

    const footer = document.createElement('div');
    footer.className = styles.footer;
    const cancel = document.createElement('button');
    cancel.textContent = 'Abbrechen';
    cancel.style.cssText = 'padding:var(--space-1-5) var(--space-3);border:1px solid var(--border-color);border-radius:var(--radius-md);background:var(--bg-tertiary);color:var(--text-primary);font:inherit;font-weight:var(--font-semibold);cursor:pointer;';
    cancel.addEventListener('click', () => cleanup(null));
    const confirm = document.createElement('button');
    confirm.textContent = 'Veröffentlichung starten';
    confirm.style.cssText = 'padding:var(--space-1-5) var(--space-3);border:1px solid var(--accent);border-radius:var(--radius-md);background:var(--accent);color:var(--accent-text);font:inherit;font-weight:var(--font-semibold);cursor:pointer;';
    confirm.addEventListener('click', () => cleanup(select.value as 'delete' | 'keep' | 'reserve' | 'deactivate'));
    footer.append(cancel, confirm);
    content.appendChild(footer);
    overlay.appendChild(content);
    container.appendChild(overlay);
    function onKey(e: KeyboardEvent): void { if (e.key === 'Escape') cleanup(null); }
    document.addEventListener('keydown', onKey);
    select.focus();
  });
}

/**
 * Show a confirmation dialog imperatively.
 * Returns a promise that resolves to true (confirm) or false (cancel).
 */
export function showConfirm(
  title: string,
  message: string,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  bullets?: string[],
  confirmVariant: 'accent' | 'danger' | 'dangerSolid' = 'accent',
): Promise<boolean> {
  return new Promise((resolve) => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    function cleanup(result: boolean): void {
      resolve(result);
      container.remove();
    }

    // Render a minimal confirm using raw DOM (avoids requiring React root)
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: var(--z-modal);
      display: flex; align-items: center; justify-content: center;
    `;

    const bg = document.createElement('div');
    bg.style.cssText = `
      position: absolute; inset: 0;
      background-color: var(--bg-overlay);
    `;
    bg.addEventListener('click', () => cleanup(false));
    overlay.appendChild(bg);

    const content = document.createElement('div');
    content.className = styles.content;

    const header = document.createElement('div');
    header.className = styles.header;
    const h2 = document.createElement('h2');
    h2.className = styles.title;
    h2.textContent = title;
    header.appendChild(h2);
    content.appendChild(header);

    const body = document.createElement('div');
    body.className = styles.body;
    const p = document.createElement('p');
    p.className = styles.confirmMessage;
    // Support bold text between „..." quotes
    const parts = message.split(/(\u201E[^\u201C]+\u201C)/);
    for (const part of parts) {
      if (part.startsWith('\u201E') && part.endsWith('\u201C')) {
        const strong = document.createElement('strong');
        strong.textContent = part;
        p.appendChild(strong);
      } else {
        p.appendChild(document.createTextNode(part));
      }
    }
    body.appendChild(p);
    if (bullets && bullets.length > 0) {
      const ul = document.createElement('ul');
      ul.style.cssText = 'margin: var(--space-2) 0 0 var(--space-4); list-style: disc; display: flex; flex-direction: column; gap: var(--space-1);';
      for (const bullet of bullets) {
        const li = document.createElement('li');
        li.textContent = bullet;
        li.style.cssText = 'font-size: var(--font-size-sm); color: var(--text-secondary);';
        ul.appendChild(li);
      }
      body.appendChild(ul);
    }
    content.appendChild(body);

    const footer = document.createElement('div');
    footer.className = styles.footer;

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = cancelText;
    cancelBtn.style.cssText = `
      display: inline-flex; align-items: center; justify-content: center;
      gap: var(--space-2); padding: var(--space-1-5) var(--space-3);
      font-size: var(--font-size-xs); font-weight: var(--font-semibold);
      border-radius: var(--radius-md); border: 1px solid var(--border-color);
      background-color: var(--bg-tertiary); color: var(--text-primary);
      cursor: pointer; font-family: inherit;
    `;
    cancelBtn.addEventListener('click', () => cleanup(false));

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = confirmText;
    // Confirm button style: accent (default), danger (red text), dangerSolid (white on red).
    const confirmColors =
      confirmVariant === 'dangerSolid'
        ? 'border: 1px solid var(--red); background-color: var(--red); color: var(--on-overlay);'
        : confirmVariant === 'danger'
          ? 'border: 1px solid var(--red); background-color: transparent; color: var(--red);'
          : 'border: 1px solid var(--accent); background-color: var(--accent); color: var(--accent-text);';
    confirmBtn.style.cssText = `
      display: inline-flex; align-items: center; justify-content: center;
      gap: var(--space-2); padding: var(--space-1-5) var(--space-3);
      font-size: var(--font-size-xs); font-weight: var(--font-semibold);
      border-radius: var(--radius-md); ${confirmColors}
      cursor: pointer; font-family: inherit;
    `;
    confirmBtn.addEventListener('click', () => cleanup(true));

    // Hover states matching the Button component (inline styles can't use :hover).
    if (confirmVariant === 'dangerSolid') {
      confirmBtn.addEventListener('mouseenter', () => {
        confirmBtn.style.backgroundColor = 'var(--red-hover)';
        confirmBtn.style.borderColor = 'var(--red-hover)';
      });
      confirmBtn.addEventListener('mouseleave', () => {
        confirmBtn.style.backgroundColor = 'var(--red)';
        confirmBtn.style.borderColor = 'var(--red)';
      });
    } else if (confirmVariant === 'danger') {
      confirmBtn.addEventListener('mouseenter', () => {
        confirmBtn.style.backgroundColor = 'var(--red-muted)';
      });
      confirmBtn.addEventListener('mouseleave', () => {
        confirmBtn.style.backgroundColor = 'transparent';
      });
    }

    footer.appendChild(cancelBtn);
    footer.appendChild(confirmBtn);
    content.appendChild(footer);
    overlay.appendChild(content);
    container.appendChild(overlay);

    // Handle Escape key
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey);
        cleanup(false);
      }
    }
    document.addEventListener('keydown', onKey);

    confirmBtn.focus();
  });
}
