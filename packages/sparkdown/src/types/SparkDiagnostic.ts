/**
 * Position in a text document expressed as zero-based line and character
 * offset. Prior to 3.17 the offsets were always based on a UTF-16 string
 * representation. So a string of the form `a𐐀b` the character offset of the
 * character `a` is 0, the character offset of `𐐀` is 1 and the character
 * offset of b is 3 since `𐐀` is represented using two code units in UTF-16.
 * Since 3.17 clients and servers can agree on a different string encoding
 * representation (e.g. UTF-8). The client announces it's supported encoding
 * via the client capability [`general.positionEncodings`](#clientCapabilities).
 * The value is an array of position encodings the client supports, with
 * decreasing preference (e.g. the encoding at index `0` is the most preferred
 * one). To stay backwards compatible the only mandatory encoding is UTF-16
 * represented via the string `utf-16`. The server can pick one of the
 * encodings offered by the client and signals that encoding back to the
 * client via the initialize result's property
 * [`capabilities.positionEncoding`](#serverCapabilities). If the string value
 * `utf-16` is missing from the client's capability `general.positionEncodings`
 * servers can safely assume that the client supports UTF-16. If the server
 * omits the position encoding in its initialize result the encoding defaults
 * to the string value `utf-16`. Implementation considerations: since the
 * conversion from one encoding into another requires the content of the
 * file / line the conversion is best done where the file is read which is
 * usually on the server side.
 *
 * Positions are line end character agnostic. So you can not specify a position
 * that denotes `\r|\n` or `\n|` where `|` represents the character offset.
 */
export interface Position {
  /**
   * Line position in a document (zero-based).
   *
   * If a line number is greater than the number of lines in a document, it defaults back to the number of lines in the document.
   * If a line number is negative, it defaults to 0.
   */
  line: number;
  /**
   * Character offset on a line in a document (zero-based).
   *
   * The meaning of this offset is determined by the negotiated
   * `PositionEncodingKind`.
   *
   * If the character value is greater than the line length it defaults back to the
   * line length.
   */
  character: number;
}

/**
 * A range in a text document expressed as (zero-based) start and end positions.
 *
 * If you want to specify a range that contains a line including the line ending
 * character(s) then use an end position denoting the start of the next line.
 * For example:
 * ```ts
 * {
 *     start: { line: 5, character: 23 }
 *     end : { line 6, character : 0 }
 * }
 * ```
 */
export interface Range {
  /**
   * The range's start position.
   */
  start: Position;
  /**
   * The range's end position.
   */
  end: Position;
}

/**
 * Represents a location inside a resource, such as a line
 * inside a text file.
 */
export interface Location {
  uri: string;
  range: Range;
}

/**
 * The diagnostic's severity.
 */
export enum DiagnosticSeverity {
  /**
   * Reports an error.
   */
  Error = 1,
  /**
   * Reports a warning.
   */
  Warning = 2,
  /**
   * Reports an information.
   */
  Information = 3,
  /**
   * Reports a hint.
   */
  Hint = 4,
}

/**
 * The diagnostic tags.
 */
export enum DiagnosticTag {
  /**
   * Unused or unnecessary code.
   *
   * Clients are allowed to render diagnostics with this tag faded out instead of having
   * an error squiggle.
   */
  Unnecessary = 1,
  /**
   * Deprecated or obsolete code.
   *
   * Clients are allowed to rendered diagnostics with this tag strike through.
   */
  Deprecated = 2,
}

/**
 * Structure to capture a description for an error code.
 */
export interface CodeDescription {
  /**
   * An URI to open with more information about the diagnostic error.
   */
  href: string;
}

/**
 * Represents a related message and source code location for a diagnostic. This should be
 * used to point to code locations that cause or related to a diagnostics, e.g when duplicating
 * a symbol in a scope.
 */
export interface DiagnosticRelatedInformation {
  /**
   * The location of this related diagnostic information.
   */
  location: Location;
  /**
   * The message of this related diagnostic information.
   */
  message: string;
}

export interface SparkDiagnostic {
  /**
   * The range at which the message applies
   */
  range: Range;
  /**
   * The diagnostic's severity. Can be omitted. If omitted it is up to the
   * client to interpret diagnostics as error, warning, info or hint.
   */
  severity?: DiagnosticSeverity;
  /**
   * The diagnostic's code, which usually appear in the user interface.
   */
  code?: number | string;
  /**
   * An optional property to describe the error code.
   * Requires the code field (above) to be present/not null.
   *
   * @since 3.16.0
   */
  codeDescription?: CodeDescription;
  /**
   * A human-readable string describing the source of this
   * diagnostic, e.g. 'typescript' or 'super lint'. It usually
   * appears in the user interface.
   */
  source?: string;
  /**
   * The diagnostic's message. It usually appears in the user interface
   */
  message: string;
  /**
   * Additional metadata about the diagnostic.
   *
   * @since 3.15.0
   */
  tags?: DiagnosticTag[];
  /**
   * An array of related diagnostic information, e.g. when symbol-names within
   * a scope collide all definitions can be marked via this property.
   */
  relatedInformation?: DiagnosticRelatedInformation[];
  /**
   * A data entry field that is preserved between a `textDocument/publishDiagnostics`
   * notification and `textDocument/codeAction` request.
   *
   * @since 3.16.0
   */
  data?: any;
}
