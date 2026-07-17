import type { Meta, StoryObj } from '@storybook/react';
import { DangerZoneCard } from './DangerZoneCard';

const meta: Meta<typeof DangerZoneCard> = {
  component: DangerZoneCard,
  title: 'Shared/DangerZoneCard',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof DangerZoneCard>;

export const Default: Story = {
  args: {
    wrapperClassName:
      'p-4.5 rounded-[13px] border border-[oklch(0.85_0.08_25)] bg-[oklch(0.98_0.015_25)]',
    description: 'Deleting your account is permanent and cannot be undone.',
    actionLabel: 'Delete account',
    onConfirm: async () => ({ ok: true }) as const,
  },
};
