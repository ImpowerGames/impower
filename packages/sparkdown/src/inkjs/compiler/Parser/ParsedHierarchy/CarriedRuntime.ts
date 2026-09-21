import type { Container as RuntimeContainer } from "../../../engine/Container";

// Where `Story.ExportRuntime` reports each runtime container it carries over
// from an earlier compile, before resolution writes this compile's values
// into it. `SparkdownCompiler` sets `record` for the length of a compile that
// has earlier stories to keep runnable (`StoryJournal`), and leaves it null
// otherwise, so a compile that keeps nothing pays one null check per
// container.
export const carriedRuntime: {
  record: ((container: RuntimeContainer) => void) | null;
} = { record: null };
