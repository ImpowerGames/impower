export interface Matcher {
  test(str: string, pos?: number): boolean;
  match(str: string, pos?: number): (string | undefined)[] | null;
}
