const difference = <T>(array: T[], values: T[]): T[] =>
  [array, values].reduce((a, b) => a.filter((c) => !b.includes(c)));

export default difference;
