/**
 * How many times a builtin has read the host's clock (`os.clock`, `os.time`
 * and `os.date` with no time given, `math.randomseed` with no seed): a value
 * no story state holds, so evaluating the same code again may give another.
 * A host that reuses what was evaluated (#657) compares the count before and
 * after the evaluation.
 */
export const hostClock = { reads: 0 };
