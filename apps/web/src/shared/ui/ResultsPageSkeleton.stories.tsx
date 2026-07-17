import type { Meta, StoryObj } from '@storybook/react';
import { ResultsPageSkeleton } from './ResultsPageSkeleton';

const meta: Meta<typeof ResultsPageSkeleton> = {
  component: ResultsPageSkeleton,
  title: 'Shared/ResultsPageSkeleton',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ResultsPageSkeleton>;

export const Default: Story = {};
