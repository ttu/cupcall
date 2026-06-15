declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type TeamId = Brand<string, 'TeamId'>;
export type PlayerId = Brand<string, 'PlayerId'>;
export type GroupId = Brand<string, 'GroupId'>;
export type MatchId = Brand<string, 'MatchId'>;
export type BracketMatchKey = Brand<string, 'BracketMatchKey'>;
export type Points = Brand<number, 'Points'>;

export const teamId = (s: string): TeamId => s as TeamId;
export const playerId = (s: string): PlayerId => s as PlayerId;
export const groupId = (s: string): GroupId => s as GroupId;
export const matchId = (s: string): MatchId => s as MatchId;
export const bracketMatchKey = (s: string): BracketMatchKey => s as BracketMatchKey;
export const points = (n: number): Points => n as Points;

export type UserId = Brand<string, 'UserId'>;
export const userId = (s: string): UserId => s as UserId;

export type PoolId = Brand<string, 'PoolId'>;
export const poolId = (s: string): PoolId => s as PoolId;

export type TournamentId = Brand<string, 'TournamentId'>;
export const tournamentId = (s: string): TournamentId => s as TournamentId;

export type PredictionId = Brand<string, 'PredictionId'>;
export const predictionId = (s: string): PredictionId => s as PredictionId;
