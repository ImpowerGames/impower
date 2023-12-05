const REGEX_PATTERN = /^([/])(.*)([/])([a-z]*)$/;

export default class Matcher {
  protected _pattern: string;

  protected _regex?: RegExp;

  constructor(pattern: string) {
    this._pattern = pattern;
    const match = pattern.match(REGEX_PATTERN);
    if (match) {
      const source = match[2] || "";
      const flags = match[4] || "u";
      this._regex = new RegExp(source, flags);
    }
  }

  match(string: string): string[] | null {
    if (this._regex) {
      return string.match(this._regex);
    }
    return string === this._pattern ? [string] : null;
  }

  test(string: string): boolean {
    if (this._regex) {
      return this._regex.test(string);
    }
    return string === this._pattern;
  }
}
