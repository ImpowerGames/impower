// Taken from https://gist.github.com/blixt/f17b47c62508be59987b
// We need a seedable PRNG and there is none in native javascript.
export class PRNG {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }

  public next(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed;
  }

  public nextFloat(): number {
    return (this.next() - 1) / 2147483646;
  }
}
