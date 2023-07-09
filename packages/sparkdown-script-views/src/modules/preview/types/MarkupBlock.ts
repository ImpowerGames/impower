export interface MarkupBlock {
  line: number;
  from: number;
  to: number;
  value: string;
  markdown?: boolean;
  margin?: string;
}
