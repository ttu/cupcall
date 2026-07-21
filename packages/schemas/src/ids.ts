import { teamId, playerId, groupId, matchId, bracketMatchKey } from '@cup/engine';
import { z } from 'zod';

/** Shared branded-id transformers reused across every schema in this package. */
export const teamIdSchema = z.string().transform(teamId);
export const playerIdSchema = z.string().transform(playerId);
export const groupIdSchema = z.string().transform(groupId);
export const matchIdSchema = z.string().transform(matchId);
export const bracketMatchKeySchema = z.string().transform(bracketMatchKey);
