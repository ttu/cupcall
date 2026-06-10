import type { Meta, StoryObj } from '@storybook/react';
import { SectionLabel } from './SectionLabel';
import { Icon } from './Icon';

const meta: Meta<typeof SectionLabel> = {
  component: SectionLabel,
  title: 'Shared/SectionLabel',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof SectionLabel>;

export const Default: Story = {
  args: { children: 'Group Stage' },
};

export const WithIcon: Story = {
  args: {
    children: 'Leaderboard',
    icon: <Icon name="trophy" size={16} />,
  },
};
