import { InfoAttributes } from "./infoAttributes";

export interface AggData extends Record<string, unknown> {
  /** group */
  g?: string;
  /** content */
  c?: string;
  /** time */
  t?: number;
  /** author */
  readonly a?: InfoAttributes;
  /** read  */
  r?: boolean;
  type?: string;
  uid?: string;
}
