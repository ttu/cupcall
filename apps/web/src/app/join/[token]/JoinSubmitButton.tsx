'use client';

import { useFormStatus } from 'react-dom';
import type { ReactElement } from 'react';

export function JoinSubmitButton(): ReactElement {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full px-6 py-3 rounded-(--radius) bg-(--green-600) text-white text-base font-bold hover:bg-(--green-700) transition-colors shadow-(--shadow-md) disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {pending ? 'Joining…' : 'Join pool'}
    </button>
  );
}
