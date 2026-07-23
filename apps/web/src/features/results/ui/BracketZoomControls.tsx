import type { ReactElement } from 'react';
import { Button } from '@/shared/ui';

type Props = {
  zoomPercent: number;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onReset: () => void;
  canZoomOut: boolean;
  canZoomIn: boolean;
};

export function BracketZoomControls({
  zoomPercent,
  onZoomOut,
  onZoomIn,
  onReset,
  canZoomOut,
  canZoomIn,
}: Props): ReactElement {
  return (
    <div className="flex items-center gap-1.5" data-testid="bracket-zoom-controls">
      <Button
        variant="ghost"
        size="sm"
        onClick={onZoomOut}
        disabled={!canZoomOut}
        aria-label="Zoom out"
      >
        −
      </Button>
      <span className="min-w-10 text-center text-[13px] font-semibold text-ink-muted tabular-nums">
        {zoomPercent}%
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={onZoomIn}
        disabled={!canZoomIn}
        aria-label="Zoom in"
      >
        +
      </Button>
      <Button variant="ghost" size="sm" onClick={onReset} aria-label="Reset zoom">
        Reset
      </Button>
    </div>
  );
}
