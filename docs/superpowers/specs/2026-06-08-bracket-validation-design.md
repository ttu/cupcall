# Bracket Validation & Pick Invalidation

**Date:** 2026-06-08
**Status:** Approved

## Summary

Three related improvements to bracket prediction UX:

1. **Group stage advancing indicator** — don't highlight teams as qualifying until the entire group is predicted.
2. **R32 empty slots** — when a group isn't fully predicted, its R32 slots show no teams (like R16 already does); any bracket match with a missing team is disabled.
3. **Pick cascade invalidation** — when group scores change and R32 participants change, delete the now-invalid pick and all downstream picks that depended on it.

---

## 1. Group Stage: Suppress Qualifying Highlight Until Complete

### What changes

`get-card.ts` builds the `derivedOrder` array for each `GroupView`. Currently `qualifies: i < autoQualify` regardless of group completeness.

**Change:** `qualifies: group.complete && i < autoQualify`

where `group.complete = matches.every(m => m.predictedHome !== null)`.

The `derivedOrder` pills are always visible. Green highlighting only appears when every match in the group has a score. Incomplete groups show all teams as grey.

### What stays the same

- The derivedOrder row is never hidden.
- Partial group orders are still derived and displayed (tentative standings while filling in scores).

---

## 2. R32 Empty Slots & Match Disabling

### get-card.ts: Slot resolution respects group completeness

`resolveSlotTeam` currently returns the partial-order team even for incomplete groups. It must be updated to return `undefined` when the relevant group is not complete.

**Change:** Build `completeGroups: Set<GroupId>` from the group views, then pass it to `resolveSlotTeam`:

- For `"NX"` refs (e.g. `"1A"`): return `undefined` if group `X` is not in `completeGroups`.
- For `"3rd[i]"` refs: return `undefined` unless _all_ groups are complete (thirds ranking is cross-group).

### BracketSection.tsx: Disable match if either team missing

Currently each pick button's `disabled` condition allows picking a home team when the away team is unknown:

```
home button: disabled = locked || noTeams || !homeTeamId
away button: disabled = locked || noTeams || !awayTeamId
```

**Change:** Disable both buttons if _either_ team is missing:

```
home button: disabled = locked || !homeTeamId || !awayTeamId
away button: disabled = locked || !homeTeamId || !awayTeamId
```

This ensures a match is only interactive when both participants are fully determined.

---

## 3. Pick Cascade Invalidation

### New engine function: `findInvalidatedPickKeys`

Location: `packages/engine/src/bracket.ts`

```typescript
export function findInvalidatedPickKeys(
  tournament: Tournament,
  newGroupOrders: Record<GroupId, TeamId[]>,
  newQualifiers: TeamId[],
  existingPicks: KnockoutPick[],
): BracketMatchKey[];
```

**Algorithm** (walks bracket in topological order — slots → progression):

1. Build a mutable `pickMap` from `existingPicks`.
2. For each R32 slot: resolve `home` and `away` using new group orders/qualifiers.
   - If either team can't be resolved (group incomplete), or the picked team is not one of the two participants → remove from `pickMap`, add key to `invalidated`.
3. For each progression entry (R16 → QF → SF → Final), in declaration order:
   - `homeTeam = pickMap.get(prog.from[0])` (winner of upstream match)
   - `awayTeam = pickMap.get(prog.from[1])`
   - If either is undefined, or the existing pick for `prog.match` is not one of `{homeTeam, awayTeam}` → remove from `pickMap`, add to `invalidated`.
4. Return `invalidated`.

The mutable `pickMap` naturally cascades: when an R32 pick is removed, its R16 match loses a participant, making its pick invalid, and so on up to Final/Bronze.

Bronze match is handled by the same progression logic (its `from[]` keys point to the SF matches; if either SF pick is gone, the bronze pick is invalidated too).

### Integration in saveGroupScore / ownerSaveGroupScore (actions.ts)

After `upsertGroupScore`, before `rescoreAfterEdit`:

1. Re-derive group orders + qualifiers from updated inputs.
2. Call `findInvalidatedPickKeys(tournament, newGroupOrders, newQualifiers, existingPicks)`.
3. If any keys returned, call `deleteKnockoutPicks(db, predictionId, invalidatedKeys)`.
4. Then call `rescoreAfterEdit` as usual.

Both `saveGroupScore` (own card) and `ownerSaveGroupScore` (owner edit) get this logic.

---

## Tests

### Engine — `bracket.test.ts`

- `findInvalidatedPickKeys`: no change to group order → no keys returned.
- Group order flip causes R32 pick for displaced team → that key returned.
- Cascade: R32 pick invalidated → dependent R16 key also returned.
- Deep cascade: R32 → R16 → QF all invalidated when R32 slot changes.
- Picked team still present in R32 slot despite opponent changing → pick kept, no keys returned.
- Group incomplete (slot unresolvable) → R32 pick for that slot invalidated.

### get-card — `get-card.test.ts`

- Incomplete group → R32 tie has `null` home/away teams.
- All groups complete → R32 tie has resolved teams.
- `"3rd[i]"` slot: unresolved until all groups complete.

### BracketSection — component test

- Tie with one `null` team → both home and away buttons are `disabled`.
- Tie with both teams present → buttons enabled (when not locked).

### Integration — `saveGroupScore` action

- Save group score that changes group A order → R32 pick for displaced team deleted.
- Cascade: after group A change, R16 pick that depended on deleted R32 pick is also deleted.
- Save group score that doesn't change qualifiers → no picks deleted.
