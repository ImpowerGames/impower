export interface Matcher {
  test(str: string, pos?: number, anchored?: boolean): boolean;
  match(
    str: string,
    pos?: number,
    anchored?: boolean,
  ): (string | undefined)[] | null;
}
