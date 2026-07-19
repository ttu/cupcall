'use client';

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

type DialogSheet = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  handleBackdropClick: (event: React.MouseEvent<HTMLDialogElement>) => void;
};

/**
 * Shared open/close wiring for a native <dialog>-based bottom sheet: opens via showModal on
 * mount, calls onClose when the dialog closes (Escape or programmatic .close()), and closes on
 * a backdrop click (a click landing outside the dialog's content box).
 */
export function useDialogSheet(onClose: () => void): DialogSheet {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  function handleBackdropClick(event: React.MouseEvent<HTMLDialogElement>): void {
    // event.target is the native click target; sonarjs can't see it narrows to the
    // dialog element itself when the click lands on the backdrop (outside <dialog>'s content).
    // eslint-disable-next-line sonarjs/different-types-comparison
    if (event.target === dialogRef.current) dialogRef.current?.close();
  }

  return { dialogRef, handleBackdropClick };
}
