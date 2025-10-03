export interface GameConfiguration {
  restarted?: boolean;
  executionTimeout?: number;
  simulateFrom?: { file: string; line: number } | null;
  simulateChoices?: Record<string, number[]> | null;
  previewFrom?: { file: string; line: number } | null;
  startFrom?: { file: string; line: number } | null;
  breakpoints?: { file: string; line: number }[];
  functionBreakpoints?: { name: string }[];
  dataBreakpoints?: { dataId: string }[];
}
