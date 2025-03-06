export interface Reference<T> {
  $type: T;
  $name: string;
  links?: Record<string, object>;
}
