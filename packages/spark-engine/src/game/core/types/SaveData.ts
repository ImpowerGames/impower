export interface SaveData {
  modules: Record<string, any>;
  context: any;
  story: string;
  runtime: string;
  simulated?: boolean;
}
