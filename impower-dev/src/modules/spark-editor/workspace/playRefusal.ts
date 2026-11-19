import { scriptTitle, type Problem } from "./problems/problemEntries";

export const ENTRY_SCRIPT = "main.sd";

export interface PlayRefusalTarget {
  uri?: string;
  script: string;
  line: number;
  character: number;
}

export const playRefusalText = (refusal: string) => `Can't play: ${refusal}`;

export const playRefusalTarget = (
  problems: readonly Problem[],
  refusal: string,
): PlayRefusalTarget => {
  const problem = problems.find(({ title }) => title === refusal);
  return problem
    ? {
        uri: problem.uri,
        script: problem.script,
        line: problem.line,
        character: problem.range.start.character,
      }
    : { script: scriptTitle(ENTRY_SCRIPT), line: 1, character: 0 };
};

export const playRefusalLink = ({ script, line }: PlayRefusalTarget) =>
  `Go to ${script}, line ${line}`;
