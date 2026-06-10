import type { Meta, StoryObj } from '@storybook/react';
import { Icon } from './Icon';

const meta: Meta<typeof Icon> = {
  component: Icon,
  title: 'Shared/Icon',
  tags: ['autodocs'],
  argTypes: {
    name: {
      control: 'select',
      options: [
        'lock',
        'trophy',
        'plus',
        'share',
        'chevron',
        'chevdown',
        'check',
        'checkcirc',
        'mail',
        'users',
        'settings',
        'ball',
        'edit',
        'history',
        'link',
        'kick',
        'rotate',
        'trash',
        'download',
        'upload',
        'flag',
        'card',
        'whistle',
        'arrow',
        'spark',
      ],
    },
  },
};

export default meta;
type Story = StoryObj<typeof Icon>;

export const Default: Story = {
  args: { name: 'trophy' },
};

export const Large: Story = {
  args: { name: 'ball', size: 48 },
};

export const Colored: Story = {
  args: { name: 'check', size: 24, color: 'var(--green-600)' },
};

export const AllIcons: Story = {
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
      {(
        [
          'lock',
          'trophy',
          'plus',
          'share',
          'chevron',
          'chevdown',
          'check',
          'checkcirc',
          'mail',
          'users',
          'settings',
          'ball',
          'edit',
          'history',
          'link',
          'kick',
          'rotate',
          'trash',
          'download',
          'upload',
          'flag',
          'card',
          'whistle',
          'arrow',
          'spark',
        ] as const
      ).map((name) => (
        <div
          key={name}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
          }}
        >
          <Icon name={name} size={20} />
          <span>{name}</span>
        </div>
      ))}
    </div>
  ),
};
