export interface MarkupBlock {
  from: number;
  to: number;
  value?: string;
  markdown?: boolean;
  attributes?: { style: string };
}
