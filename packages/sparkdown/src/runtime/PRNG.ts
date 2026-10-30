export class PRNG {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }
  public next(): number {
    return (this.seed = (this.seed * 48271) % 2147483647);
  }
  public nextFloat(): number {
    return (this.next() - 1) / 2147483646;
  }
}
