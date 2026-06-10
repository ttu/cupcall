import type { Meta, StoryObj } from '@storybook/react';
import { Chip } from './Chip';

const meta: Meta<typeof Chip> = {
  component: Chip,
  title: 'Shared/Chip',
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'green', 'orange', 'dark'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Chip>;

export const Default: Story = {
  args: { children: 'Status' },
};

export const Green: Story = {
  args: { variant: 'green', children: 'Active' },
};

export const Orange: Story = {
  args: { variant: 'orange', children: 'Pending' },
};

export const Dark: Story = {
  args: { variant: 'dark', children: 'Locked' },
};

export const WithDot: Story = {
  args: { variant: 'green', dot: true, children: 'Live' },
};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <Chip>Default</Chip>
      <Chip variant="green">Green</Chip>
      <Chip variant="orange">Orange</Chip>
      <Chip variant="dark">Dark</Chip>
      <Chip variant="green" dot>
        Live
      </Chip>
    </div>
  ),
};
