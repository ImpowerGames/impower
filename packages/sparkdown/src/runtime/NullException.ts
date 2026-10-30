export class NullException extends Error {}

export function throwNullException(name: string): never {
  throw new NullException(`${name} is null or undefined`);
}
