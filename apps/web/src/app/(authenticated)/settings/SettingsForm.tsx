'use client';

import { useActionState, useState, useTransition } from 'react';
import type { ReactElement } from 'react';
import {
  updateDisplayNameAction,
  deleteAccountAction,
  type DisplayNameState,
} from '@/features/auth/actions';
import { Avatar, Chip, Icon, SectionLabel } from '@/shared/ui';

const initial: DisplayNameState = { error: null, saved: false };

type Props = {
  displayName: string;
  email: string | null;
  ownedPoolCount: number;
};

export function SettingsForm({ displayName, email, ownedPoolCount }: Props): ReactElement {
  const [state, action, pending] = useActionState(updateDisplayNameAction, initial);
  const [isPendingDelete, startDeleteTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleDeleteClick() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteAccountAction();
      if (!result.ok) {
        setDeleteError(result.error);
        setConfirmDelete(false);
      }
      // On success, deleteAccountAction redirects to /.
    });
  }

  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ marginBottom: 18 }}>
        <SectionLabel>Profile</SectionLabel>
      </div>

      {/* Profile section */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          margin: '0 0 22px',
        }}
      >
        <Avatar name={displayName} index={0} size={56} />
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--ink)' }}>
            Shown on every leaderboard
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 2 }}>
            Your email stays private.
          </div>
        </div>
      </div>

      <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <label
          className="eyebrow"
          htmlFor="displayName"
          style={{ color: 'var(--ink-muted)', display: 'block', marginBottom: 8 }}
        >
          Display name
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            id="displayName"
            name="displayName"
            type="text"
            defaultValue={displayName}
            required
            minLength={1}
            maxLength={64}
            autoComplete="nickname"
            style={{
              flex: 1,
              height: 48,
              borderRadius: 11,
              border: '1.5px solid var(--line)',
              background: 'var(--surface)',
              padding: '0 15px',
              fontSize: 15,
              color: 'var(--ink)',
              fontFamily: 'var(--font-ui)',
              outline: 'none',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--green-500)';
              e.currentTarget.style.boxShadow = '0 0 0 3px var(--green-050)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--line)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>

        {state.error && (
          <p
            role="alert"
            style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)', fontWeight: 600 }}
          >
            {state.error}
          </p>
        )}
        {state.saved && !state.error && (
          <p style={{ marginTop: 8, fontSize: 12, color: 'var(--green-700)', fontWeight: 600 }}>
            Saved!
          </p>
        )}
      </form>

      {email && (
        <>
          <hr
            style={{
              margin: '24px 0',
              border: 'none',
              borderTop: '1px solid var(--line-soft)',
              height: 0,
            }}
          />
          <label
            className="eyebrow"
            style={{ color: 'var(--ink-muted)', display: 'block', marginBottom: 8 }}
          >
            Email
          </label>
          <div
            style={{
              height: 48,
              borderRadius: 11,
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              padding: '0 15px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Icon name="mail" size={15} color="var(--ink-muted)" />
            <span
              style={{
                flex: 1,
                fontSize: 14,
                color: 'var(--ink-soft)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {email}
            </span>
            <Chip variant="green" dot>
              Verified
            </Chip>
          </div>
        </>
      )}

      {/* Danger zone */}
      <hr
        style={{
          margin: '28px 0 0',
          border: 'none',
          borderTop: '1px solid var(--line-soft)',
          height: 0,
        }}
      />
      <div
        style={{
          marginTop: 20,
          padding: 18,
          borderRadius: 13,
          border: '1px solid oklch(0.85 0.08 25)',
          background: 'oklch(0.98 0.015 25)',
        }}
      >
        <SectionLabel icon={<Icon name="trash" size={13} color="var(--danger)" />}>
          <span style={{ color: 'var(--danger)' }}>Danger zone</span>
        </SectionLabel>
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '10px 0 14px' }}>
          {ownedPoolCount > 0
            ? `Deleting your account is permanent and will also delete ${ownedPoolCount} pool${ownedPoolCount === 1 ? '' : 's'} you own and all their data.`
            : 'Deleting your account is permanent and cannot be undone.'}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            data-testid="delete-account-btn"
            disabled={isPendingDelete}
            onClick={handleDeleteClick}
            style={{
              fontSize: 13,
              fontWeight: 700,
              padding: '8px 16px',
              borderRadius: 9,
              border: 'none',
              cursor: 'pointer',
              background: confirmDelete ? 'var(--danger)' : 'transparent',
              color: confirmDelete ? 'white' : 'var(--danger)',
              boxShadow: confirmDelete ? 'none' : 'inset 0 0 0 1.5px oklch(0.78 0.12 25)',
            }}
          >
            {isPendingDelete ? 'Deleting…' : confirmDelete ? 'Confirm delete' : 'Delete account'}
          </button>
          {confirmDelete && !isPendingDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              style={{
                fontSize: 12,
                background: 'none',
                border: 'none',
                color: 'var(--ink-muted)',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          )}
        </div>
        {deleteError && (
          <p role="alert" style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>
            {deleteError}
          </p>
        )}
      </div>
    </div>
  );
}
