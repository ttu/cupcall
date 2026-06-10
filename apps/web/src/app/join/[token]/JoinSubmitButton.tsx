'use client';

import { useFormStatus } from 'react-dom';
import type { ReactElement } from 'react';

export function JoinSubmitButton(): ReactElement {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary lg block">
      {pending ? 'Joining…' : 'Join pool & start predicting'}
    </button>
  );
}
