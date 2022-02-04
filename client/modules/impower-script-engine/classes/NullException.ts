/**
 * In the original C# code, a SystemException would be thrown when passing
 * null to methods expected a valid instance. Javascript has no such
 * concept, but TypeScript will not allow `null` to be passed to methods
 * explicitely requiring a valid type.
 *
 * Whenever TypeScript complain about the possibility of a `null` value,
 * check the offending value and it it's null, throw this exception using
 * `throwNullException(name: string)`.
 */
export class NullException extends Error {
  constructor(message?: string) {
    super(`${message} is null or undefined.`); // 'Error' breaks prototype chain here
    this.name = "NullException";
    Object.setPrototypeOf(this, new.target.prototype); // restore prototype chain
  }
}
