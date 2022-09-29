export interface Tag {
  type: "tag";
  from: number;
  to: number;
  line: number;
  name: string;
  value: string;
}
