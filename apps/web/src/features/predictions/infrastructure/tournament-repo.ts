import { getTournamentById, type TournamentRow } from '@cup/db';
import type { Db } from '@cup/db';

export type { TournamentRow };
export { getTournamentById };

export type TournamentDb = Db<import('@/shared/db').AppSchema>;
