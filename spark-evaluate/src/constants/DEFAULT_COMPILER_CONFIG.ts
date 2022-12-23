import { format } from "../utils/format";

export type Formatter = (
  str: string,
  context?: Record<string, unknown>
) => [
  string,
  {
    from: number;
    to: number;
    content: string;
    severity?: "info" | "warning" | "error";
    message?: string;
  }[],
  {
    from: number;
    to: number;
    content: string;
    severity?: "info" | "warning" | "error";
    message?: string;
  }[]
];

export const DEFAULT_COMPILER_CONFIG: {
  formatter?: Formatter;
} = {
  formatter: format,
};
