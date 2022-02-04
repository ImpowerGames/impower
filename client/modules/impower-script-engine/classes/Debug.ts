export class Debug {
  static AssertType<T>(
    variable: unknown,
    type: new () => T,
    message: string
  ): void | never {
    this.Assert(variable instanceof type, message);
  }

  static Assert(condition: boolean, message?: string): void | never {
    if (!condition) {
      if (typeof message !== "undefined") {
        console.warn(message);
      }

      // eslint-disable-next-line no-console
      if (console.trace) {
        // eslint-disable-next-line no-console
        console.trace();
      }

      throw new Error("");
    }
  }
}
