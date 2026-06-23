// =============================================================
// WeightUp — shared workout metrics
// Single source of truth for the math that used to be copy-pasted
// across dashboard / circles / profile / muscles / UserProfileModal.
// =============================================================

/**
 * Trailing window (days) for streak queries. A rest-day-tolerant streak
 * cannot span more consecutive days than this, so bounding member-streak
 * reads to this window is safe up to a ~400-day streak.
 */
export const STREAK_WINDOW_DAYS = 400;

/** Local-timezone YYYY-MM-DD for a Date (matches how logged_at dates are stored). */
export function dayStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Estimated 1-rep max (Brzycki). Returns the raw weight for a single rep.
 * Mirrors the formula previously inlined as `weight * (36 / (37 - reps))`.
 */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  const r = reps || 1;
  return r > 1 ? weightKg * (36 / (37 - r)) : weightKg;
}

/** Rounded e1RM — the form most call sites actually displayed. */
export function roundedOneRepMax(weightKg: number, reps: number): number {
  return Math.round(estimateOneRepMax(weightKg, reps));
}

/** Volume (kg) for a single set: weight × reps, nullish-safe. */
export function setVolume(weightKg: number | null | undefined, reps: number | null | undefined): number {
  return (weightKg || 0) * (reps || 0);
}

/** Total volume (kg) across a list of sets. */
export function totalVolume(
  logs: { weight_kg?: number | null; reps?: number | null }[]
): number {
  return logs.reduce((sum, l) => sum + setVolume(l.weight_kg, l.reps), 0);
}

/**
 * Rest-day-tolerant workout streak.
 *
 * Counts consecutive active days ending today, allowing a single rest day
 * between active days (two consecutive missed days ends the streak). If today
 * has no log yet, the count still starts from yesterday (grace period).
 *
 * @param activeDates  Iterable of YYYY-MM-DD strings (duplicates are fine).
 * @param now          Reference "today" — injectable for testing.
 */
export function computeStreak(activeDates: Iterable<string>, now: Date = new Date()): number {
  const days = activeDates instanceof Set ? activeDates : new Set<string>(activeDates);
  let streak = 0;
  let restDayUsed = false;
  const cursor = new Date(now);

  // Grace: if nothing logged today, start counting from yesterday.
  if (!days.has(dayStr(cursor))) cursor.setDate(cursor.getDate() - 1);

  while (true) {
    if (days.has(dayStr(cursor))) {
      streak++;
      restDayUsed = false;
      cursor.setDate(cursor.getDate() - 1);
    } else if (!restDayUsed) {
      // Allow one rest day — skip it but don't count it.
      restDayUsed = true;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break; // Two consecutive missed days — streak ends.
    }
  }
  return streak;
}
