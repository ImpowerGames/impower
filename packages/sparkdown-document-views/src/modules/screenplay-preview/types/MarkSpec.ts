export interface MarkSpec {
  type: "mark";
  from: number;
  to: number;
  attributes?: { style: string };
}
