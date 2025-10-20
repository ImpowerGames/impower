export interface ProgressValue {
  kind: string;
  title: string;
  cancellable: boolean;
  message?: string;
  percentage?: number;
}
