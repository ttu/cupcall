import type { ReactElement } from 'react';
import type { StageProgress } from '../domain/types';
import { cn } from '@/shared/ui';

type Props = { stages: StageProgress[]; vertical?: boolean };

const fmt = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });

const dotClass = (state: StageProgress['state']) =>
  cn(
    'w-2.5 h-2.5 rounded-full shrink-0',
    state === 'active'
      ? 'bg-green-500 shadow-[0_0_0_3px_var(--green-050)]'
      : state === 'completed'
        ? 'bg-green-400'
        : 'bg-line',
  );

const labelClass = (state: StageProgress['state']) =>
  cn(
    'text-[11px] font-cup-ui leading-[1.3]',
    state !== 'upcoming' ? 'font-bold' : 'font-medium',
    state === 'active' ? 'text-ink' : state === 'completed' ? 'text-ink-soft' : 'text-ink-muted',
  );

export function StageBar({ stages, vertical = false }: Props): ReactElement {
  if (vertical) {
    return (
      <div className="flex flex-col mb-2">
        {stages.map((s, i) => {
          const prev = i > 0 ? stages[i - 1] : null;
          const topFilled = prev != null && prev.state !== 'upcoming';
          const bottomFilled = s.state === 'completed';

          return (
            <div key={s.key} className="flex items-stretch">
              {/* Track column */}
              <div className="flex flex-col items-center w-5 shrink-0">
                <div
                  className={cn(
                    'w-0.5 flex-1 min-h-[10px]',
                    i === 0 ? 'bg-transparent' : topFilled ? 'bg-green-300' : 'bg-line',
                  )}
                />
                <span className={dotClass(s.state)} />
                <div
                  className={cn(
                    'w-0.5 flex-1 min-h-[10px]',
                    i === stages.length - 1
                      ? 'bg-transparent'
                      : bottomFilled
                        ? 'bg-green-300'
                        : 'bg-line',
                  )}
                />
              </div>

              {/* Content */}
              <div className="ml-3 py-1.5 flex flex-col justify-center">
                <span className={labelClass(s.state)}>{s.label}</span>
                {s.startDate && (
                  <span className="text-[10px] text-ink-muted font-medium mt-0.5 font-cup-ui">
                    {fmt.format(s.startDate)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex items-start mb-6 overflow-x-auto pb-1">
      {stages.map((s, i) => {
        const prev = i > 0 ? stages[i - 1] : null;
        const leftFilled = prev != null && prev.state !== 'upcoming';
        const rightFilled = s.state === 'completed';

        return (
          <div key={s.key} className="flex flex-col items-center flex-1 min-w-18">
            {/* Connector line + dot row */}
            <div className="flex items-center w-full mb-2">
              <div
                className={cn(
                  'flex-1 h-0.5',
                  i === 0 ? 'bg-transparent' : leftFilled ? 'bg-green-300' : 'bg-line',
                )}
              />
              <span className={dotClass(s.state)} />
              <div
                className={cn(
                  'flex-1 h-0.5',
                  i === stages.length - 1
                    ? 'bg-transparent'
                    : rightFilled
                      ? 'bg-green-300'
                      : 'bg-line',
                )}
              />
            </div>

            {/* Label */}
            <span className={cn(labelClass(s.state), 'text-center')}>{s.label}</span>

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
