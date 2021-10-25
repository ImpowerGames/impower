export interface AggData extends Record<string, unknown> {
  /** group */
  g?: string;
  /** content */
  c?: string;
  /** time */
  t?: number;
  /** author */
  readonly a?: {
    /** name */
    u?: string;
    /** picture */
    i?: string;
    /** hex */
    h?: string;
  };
  /** read  */
  r?: boolean;
}
