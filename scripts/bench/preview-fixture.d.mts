// Types for preview-fixture.mjs, for the TypeScript tests that build its
// project in memory.

export interface PreviewFixtureTarget {
  line: number;
  word: string;
  lineText: string;
  sceneLines: number;
  thenLines: number;
}

export function buildPreviewFixture(options?: {
  beforeLines?: number;
  thenLines?: number;
}): { files: Map<string, string>; target: PreviewFixtureTarget };

export function buildBeatsFixture(options?: { lines?: number }): {
  files: Map<string, string>;
  target: { line: number; sceneLines: number };
};

export function writePreviewFixture(
  dir: string,
  fixture?: { files: Map<string, string>; target: PreviewFixtureTarget },
): PreviewFixtureTarget;
