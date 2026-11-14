export interface MarkupContent {
  type: string;
  from: number;
  to: number;
  value?: string;
  attributes?: { style: string };
}
