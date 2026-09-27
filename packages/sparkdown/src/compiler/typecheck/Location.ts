// Source positions for the type checker, counted from 0 as Luau's
// `Location.h` counts them: a position is a line and a column, and a
// location runs from a begin position to an end position.

export class Position {
  constructor(
    public line: number,
    public column: number,
  ) {}

  static missing(): Position {
    return new Position(0xffffffff, 0xffffffff);
  }

  equals(rhs: Position): boolean {
    return this.line === rhs.line && this.column === rhs.column;
  }

  lt(rhs: Position): boolean {
    return this.line === rhs.line ? this.column < rhs.column : this.line < rhs.line;
  }

  gt(rhs: Position): boolean {
    return this.line === rhs.line ? this.column > rhs.column : this.line > rhs.line;
  }

  le(rhs: Position): boolean {
    return this.equals(rhs) || this.lt(rhs);
  }

  ge(rhs: Position): boolean {
    return this.equals(rhs) || this.gt(rhs);
  }

  hasValue(): boolean {
    return this.line !== 0xffffffff || this.column !== 0xffffffff;
  }

  toString(): string {
    return `${this.line}:${this.column}`;
  }
}

export class Location {
  readonly begin: Position;
  readonly end: Position;

  constructor(begin?: Position, end?: Position) {
    this.begin = begin ?? new Position(0, 0);
    this.end = end ?? new Position(0, 0);
  }

  static span(from: Location, to: Location): Location {
    return new Location(from.begin, to.end);
  }

  equals(rhs: Location): boolean {
    return this.begin.equals(rhs.begin) && this.end.equals(rhs.end);
  }

  encloses(l: Location): boolean {
    return this.begin.le(l.begin) && this.end.ge(l.end);
  }

  overlaps(l: Location): boolean {
    return (
      (this.begin.le(l.begin) && this.end.ge(l.begin)) ||
      (this.begin.le(l.end) && this.end.ge(l.end)) ||
      (this.begin.ge(l.begin) && this.end.le(l.end))
    );
  }

  contains(p: Position): boolean {
    return this.begin.le(p) && p.lt(this.end);
  }

  containsClosed(p: Position): boolean {
    return this.begin.le(p) && p.le(this.end);
  }

  toString(): string {
    return `${this.begin}-${this.end}`;
  }
}
