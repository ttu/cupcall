import type { Meta, StoryObj } from '@storybook/react';
import { BackLink } from './BackLink';

const meta: Meta<typeof BackLink> = {
  component: BackLink,
  title: 'Shared/BackLink',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof BackLink>;

export const Default: Story = {
  args: { href: '/pools/123', children: 'Summer Cup' },
};

export const LongLabel: Story = {
  args: { href: '/', children: 'Back to the Champions League Grand Final Pool' },
};
