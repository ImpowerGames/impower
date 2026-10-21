/**
 * How many times a builtin has read a value no story state holds, so that
 * evaluating the same code again may give another (#657): the host's clock
 * (`os.clock`, and `os.time` and `os.date` with no time given), an object's
 * identity (`tostring` of a table, which numbers objects in the order they
 * are first shown), and a
 * pick by the host's random numbers (`t:random()` with no story to draw
 * from). A host that reuses what was evaluated compares the count before
 * and after the evaluation.
 */
export const ambientReads = { count: 0 };
