import { CharacterSet } from "./CharacterSet";

export class CharacterRange {
  _start: number;

  _end: number;

  _excludes: number[];

  _correspondingCharSet: CharacterSet = new CharacterSet();

  get start(): number {
    return this._start;
  }

  get end(): number {
    return this._end;
  }

  constructor(start: number, end: number, excludes?: number[]) {
    this._start = start;
    this._end = end;
    this._excludes = excludes ? [...excludes] : [];
  }

  static Define(
    start: string,
    end: string,
    excludes?: CharacterSet
  ): CharacterRange {
    return new CharacterRange(
      start.charCodeAt(0),
      end.charCodeAt(0),
      excludes.map((x) => x.charCodeAt(0))
    );
  }

  ToCharacterSet(): CharacterSet {
    if (this._correspondingCharSet.length === 0) {
      for (let c = this._start; c <= this._end; c += 1) {
        if (!this._excludes.includes(c)) {
          this._correspondingCharSet.push(String.fromCharCode(c));
        }
      }
    }
    return this._correspondingCharSet;
  }
}
