import type { ReactElement } from 'react';
import type { StageProgress } from '../domain/types';
import { cn } from '@/shared/ui';

type Props = { stages: StageProgress[] };

const fmt = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });

export function StageBar({ stages }: Props): ReactElement {
  return (
    <div className="flex items-start mb-6 overflow-x-auto pb-1">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1] : null;
        const leftFilled = prev != null && prev.state !== 'upcoming';
        const rightFilled = s.state === 'completed';

        return (
          <div key={s.key} className="flex flex-col items-center flex-1 min-w-[72px]">
            {/* Connector line + dot row */}
            <div className="flex items-center w-full mb-2">
              <div
                className={cn(
                  'flex-1 h-[2px]',
                  i === 0 ? 'bg-transparent' : leftFilled ? 'bg-green-300' : 'bg-line',
                )}
              />
              <span
                className={cn(
                  'w-[10px] h-[10px] rounded-full shrink-0',
                  s.state === 'active'
                    ? 'bg-green-500 shadow-[0_0_0_3px_var(--green-050)]'
                    : s.state === 'completed'
                      ? 'bg-green-400'
                      : 'bg-line',
                )}
              />
              <div
                className={cn(
                  'flex-1 h-[2px]',
                  i === stages.length - 1
                    ? 'bg-transparent'
                    : rightFilled
                      ? 'bg-green-300'
                      : 'bg-line',
                )}
              />
            </div>

            {/* Label */}
            <span
              className={cn(
                'text-[11px] font-cup-ui text-center leading-[1.3]',
                s.state !== 'upcoming' ? 'font-bold' : 'font-medium',
                s.state === 'active'
                  ? 'text-ink'
                  : s.state === 'completed'
                    ? 'text-ink-soft'
                    : 'text-ink-muted',
              )}
            >
              {s.label}
            </span>

            {/* Date */}
            {s.startDate && (
              <span className="text-[10px] text-ink-muted font-medium mt-0.5 font-cup-ui">
                {fmt.format(s.startDate)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
