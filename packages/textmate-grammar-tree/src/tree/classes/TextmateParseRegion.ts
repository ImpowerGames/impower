import { type Input, TreeFragment } from "@lezer/common";

const ENDS_WITH_NEWLINE_REGEX = /(\r\n|\r|\n)$/;

export class TextmateParseRegion {
  declare from: number;

  declare to: number;

  declare original: {
    from: number;
    to: number;
    length: number;
  };

  declare edit?: {
    from: number;
    to: number;
    offset: number;
  };

  declare input: Input;

  declare ranges: { from: number; to: number }[];

  constructor(
    input: Input,
    ranges: { from: number; to: number }[],
    fragments?: readonly TreeFragment[],
  ) {
    this.input = input;
    this.from = ranges[0]!.from;
    this.to = Math.min(input.length, ranges[ranges.length - 1]!.to);
    this.original = { from: this.from, to: this.to, length: this.length };
    this.ranges = ranges;

    if (fragments?.length) {
      let from: number, to: number, offset: number;

      if (fragments.length === 1) {
        const fragment = fragments[0]!;
        if (
          fragment.offset === 0 &&
          !fragment.openStart &&
          fragment.openEnd &&
          fragment.from === 0 &&
          fragment.to >= input.length
        ) {
          from = input.length;
          to = input.length;
          offset = 0;
        } else {
          from = fragment.openStart ? this.from : fragment.to;
          to = fragment.openStart ? fragment.from : this.to;
          offset = -fragment.offset;
        }
      } else {
        const reversed = [...fragments].reverse();
        const first =
          reversed.find((f) => !f.openStart && f.openEnd) || fragments[0]!;
        const last =
          fragments.find((f) => f.openStart && !f.openEnd) || reversed[0]!;

        from = first.openStart && first.openEnd ? first.from : first.to;
        to = last.openStart && last.openEnd ? last.to : last.from;
        offset = -last.offset;

        if (from > to) {
          from = this.to;
          to = this.to;
          offset = 0;
        }
      }

      this.edit = { from, to, offset };
    }
  }

  get length() {
    return this.to - this.from;
  }

  get contiguous() {
    return this.ranges.length === 1;
  }

  compensate(pos: number, addition: number): number {
    const desired = pos + addition;
    if (this.ranges.length === 1) {
      return desired;
    }

    const range = this.posRange(pos);
    if (!range) {
      return desired;
    }

    if (desired > range.to) {
      const next = this.posRange(pos, 1);
      if (!next) {
        return desired;
      }
      const nextDesired = next.from + (desired - range.to) - 1;
      if (nextDesired > next.to) {
        return this.compensate(next.to, nextDesired - next.to);
      }
      return nextDesired;
    }
    else if (desired < range.from) {
      const prev = this.posRange(pos, -1);
      if (!prev) {
        return desired;
      }
      const prevDesired = prev.to + (desired - range.from) + 1;
      if (prevDesired < prev.from) {
        return this.compensate(prev.from, prevDesired - prev.from);
      }
      return prevDesired;
    }

    return desired;
  }

  clamp(from: number, to: number) {
    const range = this.posRange(from);
    if (!range) {
      return to;
    }
    return range.to;
  }

  posRange(pos: number, side: -1 | 0 | 1 = 0) {
    if (this.ranges.length === 1) {
      return this.ranges[0];
    }
    for (let i = 0; i < this.ranges.length; i++) {
      const range = this.ranges[i]!;
      if (pos >= range.from && pos <= range.to) {
        let final: { from: number; to: number };
        // prettier-ignore
        switch (side) {
            case -1: final = this.ranges[i - 1]!; break
            case  0: final = range; break
            case  1: final = this.ranges[i + 1]!; break
          }
        return final ?? null;
      }
    }
    return null;
  }

  next(from: number) {
    let str = "";
    let pos = from;
    while (pos < this.input.length && !this.endsLine(str, pos)) {
      const chunk = this.input.chunk(pos);
      str += chunk;
      pos += chunk.length;
    }
    return str;
  }

  protected endsLine(str: string, pos: number) {
    if (!str.match(ENDS_WITH_NEWLINE_REGEX)) {
      return false;
    }
    return (
      !str.endsWith("\r") ||
      pos >= this.input.length ||
      this.input.read(pos, pos + 1) !== "\n"
    );
  }
}
