import type { Meta, StoryObj } from '@storybook/react';
import { TeamBadge } from './TeamBadge';

const meta: Meta<typeof TeamBadge> = {
  component: TeamBadge,
  title: 'Shared/TeamBadge',
  tags: ['autodocs'],
  argTypes: {
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof TeamBadge>;

export const Default: Story = {
  args: { teamId: 'BRA' },
};

export const Small: Story = {
  args: { teamId: 'FRA', size: 'sm' },
};

export const Large: Story = {
  args: { teamId: 'GER', size: 'lg' },
};

export const ExtraLarge: Story = {
  args: { teamId: 'ESP', size: 'xl' },
};

export const Unknown: Story = {
  args: { teamId: null },
};

export const AllSizes: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
        <div
          key={size}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
          }}
        >
          <TeamBadge teamId="ARG" size={size} />
          <span>{size}</span>
        </div>
      ))}
    </div>
  ),
};

export const SampleTeams: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {['BRA', 'FRA', 'GER', 'ARG', 'ESP', 'ENG', 'POR', 'NED', 'ITA', 'BEL'].map((id) => (
        <TeamBadge key={id} teamId={id} />
      ))}
    </div>
  ),
};
