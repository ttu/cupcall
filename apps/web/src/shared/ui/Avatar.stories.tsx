import type { Meta, StoryObj } from '@storybook/react';
import { Avatar } from './Avatar';

const meta: Meta<typeof Avatar> = {
  component: Avatar,
  title: 'Shared/Avatar',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Avatar>;

export const Default: Story = {
  args: { name: 'Alice', index: 0 },
};

export const TwoWordName: Story = {
  args: { name: 'John Smith', index: 1 },
};

export const Large: Story = {
  args: { name: 'Carlos Ruiz', index: 2, size: 56 },
};

export const AllColors: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8 }}>
      {['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank'].map((name, i) => (
        <Avatar key={name} name={name} index={i} />
      ))}
    </div>
  ),
};
