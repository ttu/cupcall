import type { ReactElement } from 'react';
import Link from 'next/link';
import type { RaceChartData } from '@/shared/race-chart';
import { RaceChart } from '@/features/results';

/** Clickable "Points Race" teaser card linking to the full results race tab. */
export function RaceChartPreview({
  href,
  testId,
  raceChart,
}: {
  href: string;
  testId: string;
  raceChart: RaceChartData;
}): ReactElement {
  return (
    <Link href={href} data-testid={testId} className="block no-underline text-inherit">
      <div className="card p-[14px_18px_12px] cursor-pointer">
        <div className="flex items-center justify-between mb-2.5">
          <span className="section-label">Points Race</span>
          <span className="text-xs font-bold text-ink-muted">View full →</span>
        </div>
        <RaceChart
          stages={raceChart.chartStages}
          nowIndex={raceChart.chartNowIndex}
          players={raceChart.chartPlayers}
        />
      </div>
    </Link>
  );
}
