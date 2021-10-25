const intersection = <T>(...arrays: T[][]): T[] =>
  arrays.reduce((a, b) => a.filter((c) => b.includes(c)));

export default intersection;
