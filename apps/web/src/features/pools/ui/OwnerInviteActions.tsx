import type { ReactElement } from 'react';

type Props = {
  isPending: boolean;
  confirmRotate: boolean;
  confirmRemove: boolean;
  onRotateClick: () => void;
  onRemoveClick: () => void;
  onCancelRotate: () => void;
  onCancelRemove: () => void;
};

export function OwnerInviteActions({
  isPending,
  confirmRotate,
  confirmRemove,
  onRotateClick,
  onRemoveClick,
  onCancelRotate,
  onCancelRemove,
}: Props): ReactElement {
  return (
    <div className="flex flex-wrap gap-2.5 items-center">
      {confirmRotate ? (
        <>
          <button
            type="button"
            disabled={isPending}
            onClick={onRotateClick}
            className="btn btn-ghost sm text-[11px]"
          >
            Confirm reset
          </button>
          <button
            type="button"
            onClick={onCancelRotate}
            className="text-[11px] bg-transparent border-0 text-ink-muted cursor-pointer"
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onRotateClick}
          disabled={isPending}
          className="text-[11px] font-bold bg-transparent border-0 text-ink-muted cursor-pointer"
        >
          {isPending ? 'Working…' : 'Reset link'}
        </button>
      )}

      {!confirmRotate && (
        <>
          {confirmRemove ? (
            <>
              <button
                type="button"
                disabled={isPending}
                onClick={onRemoveClick}
                className="text-[11px] font-bold py-1 px-2.5 rounded-[7px] border-0 bg-danger text-white cursor-pointer"
              >
                Confirm remove
              </button>
              <button
                type="button"
                onClick={onCancelRemove}
                className="text-[11px] bg-transparent border-0 text-ink-muted cursor-pointer"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onRemoveClick}
              disabled={isPending}
              className="text-[11px] font-bold bg-transparent border-0 text-ink-muted cursor-pointer"
            >
              Remove link
            </button>
          )}
        </>
      )}
    </div>
  );
}
