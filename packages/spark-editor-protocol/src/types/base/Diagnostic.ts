import { Range } from "./Range";

/**
 * Represents a location inside a resource, such as a line
 * inside a text file.
 */
export interface Location {
  uri: string;
  range: Range;
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
export declare type DiagnosticSeverity = 1 | 2 | 3 | 4;
/**
 * The diagnostic tags.
 *
 * @since 3.15.0
 */
export declare namespace DiagnosticTag {
  /**
   * Unused or unnecessary code.
   *
   * Clients are allowed to render diagnostics with this tag faded out instead of having
   * an error squiggle.
   */
  const Unnecessary: 1;
  /**
   * Deprecated or obsolete code.
   *
   * Clients are allowed to rendered diagnostics with this tag strike through.
   */
  const Deprecated: 2;
}
export declare type DiagnosticTag = 1 | 2;
/**
 * Structure to capture a description for an error code.
 *
 * @since 3.16.0
 */
export interface CodeDescription {
  /**
   * An URI to open with more information about the diagnostic error.
   */
  href: string;
}
/**
 * The CodeDescription namespace provides functions to deal with descriptions for diagnostic codes.
 *
 * @since 3.16.0
 */
export declare namespace CodeDescription {
  function is(value: any): value is CodeDescription;
}
/**
 * Represents a diagnostic, such as a compiler error or warning. Diagnostic objects
 * are only valid in the scope of a resource.
 */
export interface Diagnostic {
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
