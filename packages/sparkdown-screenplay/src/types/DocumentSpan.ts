import { FormattedText } from "./FormattedText";

export interface DocumentSpan {
  tag: string;

  line: number;
  from: number;
  to: number;

  scene?: string | number;
  level?: number;

  content?: FormattedText[];

  leftColumn?: DocumentSpan[];
  rightColumn?: DocumentSpan[];
}
