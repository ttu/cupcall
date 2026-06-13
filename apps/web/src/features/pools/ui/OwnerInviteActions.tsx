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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
      {confirmRotate ? (
        <>
          <button
            type="button"
            disabled={isPending}
            onClick={onRotateClick}
            className="btn btn-ghost sm"
            style={{ fontSize: 11 }}
          >
            Confirm reset
          </button>
          <button
            type="button"
            onClick={onCancelRotate}
            style={{
              fontSize: 11,
              background: 'none',
              border: 'none',
              color: 'var(--ink-muted)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={onRotateClick}
          disabled={isPending}
          style={{
            fontSize: 11,
            fontWeight: 700,
            background: 'none',
            border: 'none',
            color: 'var(--ink-muted)',
            cursor: 'pointer',
          }}
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
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: 7,
                  border: 'none',
                  background: 'var(--danger)',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                Confirm remove
              </button>
              <button
                type="button"
                onClick={onCancelRemove}
                style={{
                  fontSize: 11,
                  background: 'none',
                  border: 'none',
                  color: 'var(--ink-muted)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onRemoveClick}
              disabled={isPending}
              style={{
                fontSize: 11,
                fontWeight: 700,
                background: 'none',
                border: 'none',
                color: 'var(--ink-muted)',
                cursor: 'pointer',
              }}
            >
              Remove link
            </button>
          )}
        </>
      )}
    </div>
  );
}
