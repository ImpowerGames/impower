import { Line } from "@codemirror/state";

export interface MarkupBlock {
  line: Line;
  from: number;
  to: number;
  value: string;
  markdown?: boolean;
  margin?: string;
}
