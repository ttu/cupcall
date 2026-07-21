const PREFIX_MAP: Record<string, string> = {
  'ro32-': 'R32',
  'ro16-': 'R16',
  'qf-': 'QF',
  'sf-': 'SF',
};

/** Maps a bracket match key (e.g. "qf-1") to its display round label (e.g. "QF"). */
export function getRoundLabel(matchKey: string, rounds: string[]): string {
  for (const [prefix, label] of Object.entries(PREFIX_MAP)) {
    if (matchKey.startsWith(prefix)) return label;
  }
  // Fallback: find the round in the bracket.rounds list by checking if the key starts with a lowercase version
  for (const r of rounds) {
    if (matchKey.toLowerCase().startsWith(r.toLowerCase().replace(/\s+/g, '-'))) return r;
  }
  return matchKey;
}
