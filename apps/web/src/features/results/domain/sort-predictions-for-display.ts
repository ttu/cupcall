type DisplayablePrediction = { isCurrentUser: boolean; points: number; displayName: string };

/** Current user first, then highest points, then alphabetical by display name. */
export function sortPredictionsForDisplay<T extends DisplayablePrediction>(predictions: T[]): T[] {
  return predictions.toSorted((a, b) => {
    if (a.isCurrentUser !== b.isCurrentUser) return a.isCurrentUser ? -1 : 1;
    if (a.points !== b.points) return b.points - a.points;
    return a.displayName.localeCompare(b.displayName);
  });
}
