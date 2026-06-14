'use client';

import { useFormStatus } from 'react-dom';
import type { ReactElement } from 'react';
import { Button } from '@/shared/ui';

export function JoinSubmitButton(): ReactElement {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="lg" block disabled={pending}>
      {pending ? 'Joining…' : 'Join pool & start predicting'}
    </Button>
  );
}
