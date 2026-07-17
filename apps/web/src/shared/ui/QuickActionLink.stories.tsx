import type { Meta, StoryObj } from '@storybook/react';
import { QuickActionLink } from './QuickActionLink';

const meta: Meta<typeof QuickActionLink> = {
  component: QuickActionLink,
  title: 'Shared/QuickActionLink',
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['orange', 'green'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof QuickActionLink>;

export const Results: Story = {
  args: {
    href: '#',
    testId: 'quick-action-results',
    variant: 'orange',
    iconName: 'trophy',
    title: 'Results & standings',
    subtitle: 'Scores, groups & knockout',
  },
};

export const Predictions: Story = {
  args: {
    href: '#',
    testId: 'quick-action-predictions',
    variant: 'green',
    iconName: 'card',
    title: 'My predictions',
    subtitle: 'Fill in your picks',
  },
};
