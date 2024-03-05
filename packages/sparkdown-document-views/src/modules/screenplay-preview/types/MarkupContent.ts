export interface MarkupContent {
  type: string;
  from: number;
  to: number;
  value?: string;
  markdown?: boolean;
  attributes?: { style: string };
}
