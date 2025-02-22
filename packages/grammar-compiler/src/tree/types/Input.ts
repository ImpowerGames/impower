export interface Input {
  /// The length of the document.
  readonly length: number;
  /// Get the chunk after the given position. The returned string
  /// should start at `from` and, if that isn't the end of the
  /// document, may be of any length greater than zero.
  chunk(from: number): string;
  /// Indicates whether the chunks already end at line breaks, so that
  /// client code that wants to work by-line can avoid re-scanning
  /// them for line breaks. When this is true, the result of `chunk()`
  /// should either be a single line break, or the content between
  /// `from` and the next line break.
  readonly lineChunks: boolean;
  /// Read the part of the document between the given positions.
  read(from: number, to: number): string;
}
