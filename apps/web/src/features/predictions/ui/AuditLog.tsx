import type { ReactElement } from 'react';
import type { Tournament, TeamId, PlayerId } from '@cup/engine';
import { getSpecialBetDefs } from '@cup/engine';
import type { AuditEntry } from '../domain/types';

type AuditContext = {
  tournament: Tournament;
};

type Props = {
  entries: AuditEntry[];
  context?: AuditContext;
};

type ResolverMaps = {
  teamMap: Map<string, string>;
  playerMap: Map<string, string>;
  matchMap: Map<string, { group: string; home: TeamId; away: TeamId }>;
  betLabelMap: Map<string, string>;
  betKindMap: Map<string, string>;
};

function buildMaps(tournament: Tournament): ResolverMaps {
  const teamMap = new Map(tournament.teams.map((t) => [t.id as string, t.name]));
  const playerMap = new Map(tournament.players.map((p) => [p.id as string, p.name]));
  const matchMap = new Map(
    tournament.groupMatches.map((m) => [
      m.id as string,
      { group: m.group, home: m.home, away: m.away },
    ]),
  );
  const betDefs = getSpecialBetDefs(tournament.scoring);
  const betLabelMap = new Map(betDefs.map((d) => [d.key, d.label]));
  const betKindMap = new Map(betDefs.map((d) => [d.key, d.kind]));
  return { teamMap, playerMap, matchMap, betLabelMap, betKindMap };
}

function formatBracketKey(key: string): string {
  const prefixMap: [string, string][] = [
    ['ro32-', 'R32 #'],
    ['ro16-', 'R16 #'],
    ['qf-', 'QF #'],
    ['sf-', 'SF #'],
  ];
  for (const [prefix, label] of prefixMap) {
    if (key.startsWith(prefix)) return label + key.slice(prefix.length);
  }
  if (key === 'final') return 'Final';
  if (key === 'bronze') return '3rd place';
  return key;
}

function formatFieldLabel(fieldPath: string, maps: ResolverMaps): string {
  const { teamMap, matchMap, betLabelMap } = maps;

  if (fieldPath.startsWith('groupScores.')) {
    const mId = fieldPath.slice('groupScores.'.length);
    const m = matchMap.get(mId);
    if (m) {
      return `Group ${m.group} · ${teamMap.get(m.home as string) ?? m.home} vs ${teamMap.get(m.away as string) ?? m.away}`;
    }
    return `Group score · ${mId}`;
  }

  if (fieldPath.startsWith('knockoutPicks.')) {
    return `Knockout · ${formatBracketKey(fieldPath.slice('knockoutPicks.'.length))}`;
  }

  if (fieldPath === 'finishScores.final') return 'Final — score';
  if (fieldPath === 'finishScores.bronze') return '3rd place — score';

  if (fieldPath.startsWith('specials.')) {
    const betKey = fieldPath.slice('specials.'.length);
    return betLabelMap.get(betKey) ?? betKey;
  }

  return fieldPath;
}

function formatScore(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object' && v !== null && 'home' in v && 'away' in v) {
    return `${(v as { home: number; away: number }).home}–${(v as { home: number; away: number }).away}`;
  }
  return JSON.stringify(v);
}

function formatValue(fieldPath: string, v: unknown, maps: ResolverMaps): string {
  const { teamMap, playerMap, betKindMap } = maps;

  if (v === null || v === undefined) return '—';

  if (fieldPath.startsWith('groupScores.') || fieldPath.startsWith('finishScores.')) {
    return formatScore(v);
  }

  if (fieldPath.startsWith('knockoutPicks.')) {
    const teamId = String(v) as TeamId;
    return teamMap.get(teamId) ?? teamId;
  }

  if (fieldPath.startsWith('specials.')) {
    const betKey = fieldPath.slice('specials.'.length);
    const kind = betKindMap.get(betKey);
    if (kind === 'team') return teamMap.get(String(v) as TeamId) ?? String(v);
    if (kind === 'player') return playerMap.get(String(v) as PlayerId) ?? String(v);
    if (kind === 'bool') return v ? 'Yes' : 'No';
    return String(v);
  }

  return JSON.stringify(v);
}

export function AuditLog({ entries, context }: Props): ReactElement | null {
  if (entries.length === 0) return null;

  const maps = context ? buildMaps(context.tournament) : null;

  return (
    <section id="audit-log" aria-label="Edit history">
      <h3 className="text-sm font-semibold text-ink-soft mb-2">Edit History</h3>
      <ol className="space-y-2">
        {entries.map((entry) => {
          const label = maps ? formatFieldLabel(entry.fieldPath, maps) : entry.fieldPath;
          const oldVal = maps
            ? formatValue(entry.fieldPath, entry.oldValue, maps)
            : entry.oldValue !== null
              ? JSON.stringify(entry.oldValue)
              : '—';
          const newVal = maps
            ? formatValue(entry.fieldPath, entry.newValue, maps)
            : JSON.stringify(entry.newValue);

          return (
            <li
              key={entry.id}
              className="text-xs text-ink-muted rounded-cup-sm border border-line-soft bg-surface-2 px-3 py-2 flex flex-col gap-0.5"
            >
              <span className="font-medium text-ink-soft">
                {entry.editorName} edited <span className="font-semibold text-ink">{label}</span>
              </span>
              <span>
                {oldVal}
                {' → '}
                {newVal}
              </span>
              {entry.reason && <span className="italic">{entry.reason}</span>}
              <time className="text-ink-muted" dateTime={entry.editedAt.toISOString()}>
                {entry.editedAt.toLocaleString()}
              </time>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
