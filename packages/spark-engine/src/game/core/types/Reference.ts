export interface Reference<T> {
  $type: T;
  $name: string;
  $link?: Record<string, object>;
}
