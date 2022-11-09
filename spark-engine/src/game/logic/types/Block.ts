export interface Block {
  from: number;
  to: number;
  line: number;
  indent: number;
  index: number;
  level: number;
  type: "section" | "function" | "method" | "detector";
  name: string;
  parent?: string;
  children?: string[];
  triggers?: string[];
  variables?: Record<string, { name: string; type: string; value: unknown }>;
  commands?: Record<string, { line: number }>;
}
