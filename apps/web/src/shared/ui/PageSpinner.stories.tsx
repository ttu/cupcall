import type { Meta, StoryObj } from '@storybook/react';
import { PageSpinner } from './PageSpinner';

const meta: Meta<typeof PageSpinner> = {
  component: PageSpinner,
  title: 'Shared/PageSpinner',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof PageSpinner>;

export const Default: Story = {};
