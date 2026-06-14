'use client';

import { useActionState, useState, useTransition } from 'react';
import type { ReactElement } from 'react';
import {
  updateDisplayNameAction,
  deleteAccountAction,
  type DisplayNameState,
} from '@/features/auth/actions';
import { signOutAction } from '../nav-actions';
import { Avatar, Button, Chip, Icon, SectionLabel } from '@/shared/ui';

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
    <div className="card p-6">
      <div className="mb-4.5">
        <SectionLabel>Profile</SectionLabel>
      </div>

      {/* Profile section */}
      <div className="flex items-center gap-4 mb-5.5">
        <Avatar name={displayName} index={0} size={56} />
        <div>
          <div className="font-extrabold text-base text-ink">Shown on every leaderboard</div>
          <div className="text-[13px] text-ink-muted mt-0.5">Your email stays private.</div>
        </div>
      </div>

      <form action={action} className="flex flex-col gap-0">
        <label className="eyebrow text-ink-muted block mb-2" htmlFor="displayName">
          Display name
        </label>
        <div className="flex gap-2.5">
          <input
            id="displayName"
            name="displayName"
            type="text"
            defaultValue={displayName}
            required
            minLength={1}
            maxLength={64}
            autoComplete="nickname"
            className="flex-1 h-12 rounded-cup-btn border-input border-line bg-surface px-[15px] text-[15px] text-ink font-cup-ui outline-none"
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--green-500)';
              e.currentTarget.style.boxShadow = '0 0 0 3px var(--green-050)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--line)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>

        {state.error && (
          <p role="alert" className="mt-2 text-xs text-danger font-semibold">
            {state.error}
          </p>
        )}
        {state.saved && !state.error && (
          <p className="mt-2 text-xs text-green-700 font-semibold">Saved!</p>
        )}
      </form>

      {email && (
        <>
          <hr className="my-6 border-none border-t border-line-soft h-0" />
          <label className="eyebrow text-ink-muted block mb-2">Email</label>
          <div className="h-12 rounded-cup-btn bg-surface-2 border border-line px-[15px] flex items-center gap-2.5">
            <Icon name="mail" size={15} color="var(--ink-muted)" />
            <span className="flex-1 text-[14px] text-ink-soft truncate">{email}</span>
            <Chip variant="green" dot>
              Verified
            </Chip>
          </div>
        </>
      )}

      {/* Sign out — visible on mobile where the sidebar is hidden */}
      <hr className="mt-7 border-none border-t border-line-soft h-0 md:hidden" />
      <form action={signOutAction} className="mt-5 md:hidden">
        <button
          type="submit"
          className="flex items-center gap-2.5 text-[13px] font-bold text-ink-muted bg-transparent border-0 cursor-pointer p-0"
        >
          <Icon name="arrow" size={16} color="var(--ink-muted)" />
          Sign out
        </button>
      </form>

      {/* Danger zone */}
      <hr className="mt-7 border-none border-t border-line-soft h-0" />
      <div className="mt-5 p-4.5 rounded-[13px] border border-[oklch(0.85_0.08_25)] bg-[oklch(0.98_0.015_25)]">
        <SectionLabel icon={<Icon name="trash" size={13} color="var(--danger)" />}>
          <span className="text-danger">Danger zone</span>
        </SectionLabel>
        <p className="text-xs text-ink-soft mt-2.5 mb-3.5">
          {ownedPoolCount > 0
            ? `Deleting your account is permanent and will also delete ${ownedPoolCount} pool${ownedPoolCount === 1 ? '' : 's'} you own and all their data.`
            : 'Deleting your account is permanent and cannot be undone.'}
        </p>
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant={confirmDelete ? 'danger' : 'ghost-danger'}
            size="sm"
            data-testid="delete-account-btn"
            disabled={isPendingDelete}
            onClick={handleDeleteClick}
          >
            {isPendingDelete ? 'Deleting…' : confirmDelete ? 'Confirm delete' : 'Delete account'}
          </Button>
          {confirmDelete && !isPendingDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="text-xs bg-transparent border-0 text-ink-muted cursor-pointer"
            >
              Cancel
            </button>
          )}
        </div>
        {deleteError && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {deleteError}
          </p>
        )}
      </div>
    </div>
  );
}
