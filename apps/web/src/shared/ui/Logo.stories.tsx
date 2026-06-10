import type { Meta, StoryObj, Decorator } from '@storybook/react';
import { Logo } from './Logo';

const meta: Meta<typeof Logo> = {
  component: Logo,
  title: 'Shared/Logo',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Logo>;

const darkDecorator: Decorator = (Story) => (
  <div style={{ background: 'var(--ink-950)', padding: 16, display: 'inline-block' }}>
    <Story />
  </div>
);

export const Default: Story = {
  args: {},
};

export const Large: Story = {
  args: { size: 'lg' },
};

export const Dark: Story = {
  args: { dark: true },
  parameters: {
    backgrounds: { default: 'dark' },
  },
  decorators: [darkDecorator],
};
