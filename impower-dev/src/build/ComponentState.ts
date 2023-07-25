export interface ComponentState {
  attrs?: Record<string, string>;
  context?: Record<string, unknown>;
  store?: Record<string, unknown>;
  instanceID?: string;
}
