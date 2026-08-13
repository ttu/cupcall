import type { Meta, StoryObj } from '@storybook/react';
import { CopyField } from './CopyField';

const meta: Meta<typeof CopyField> = {
  component: CopyField,
  title: 'Shared/CopyField',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof CopyField>;

export const Default: Story = {
  args: { value: 'https://cupcall.app/join/ab12cd34' },
};

export const CustomLabel: Story = {
  args: { value: 'https://cupcall.app/view/xyz789', label: 'View-only link' },
};

/** Drives the button click so the story lands in the post-copy "Copied!" state. */
export const Copied: Story = {
  args: { value: 'https://cupcall.app/join/ab12cd34' },
  play: async ({ canvasElement }) => {
    const { within, userEvent } = await import('@storybook/test');
    // Stub the Clipboard API so the interaction is deterministic in headless browsers
    // that don't grant clipboard permissions.
    Object.assign(navigator, { clipboard: { writeText: async () => {} } });
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /copy/i }));
  },
};
