export interface AggData extends Record<string, unknown> {
  /** group */
  g?: string;
  /** content */
  c?: string;
  /** time */
  t?: number;
  /** author */
  readonly a?: {
    /** username */
    u?: string;
    /** icon */
    i?: string;
    /** hex */
    h?: string;
  };
  /** read  */
  r?: boolean;
  type?: string;
  uid?: string;
}
