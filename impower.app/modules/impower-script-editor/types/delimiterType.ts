/// Delimiters are used during inline parsing to store the positions
/// of things that _might_ be delimiters, if another matching
/// delimiter is found. They are identified by objects with these
/// properties.
export interface DelimiterType {
  /// If this is given, the delimiter should be matched automatically
  /// when a piece of inline content is finished. Such delimiters will
  /// be matched with delimiters of the same type according to their
  /// [open and close](#InlineContext.addDelimiter) properties. When a
  /// match is found, the content between the delimiters is wrapped in
  /// a node whose name is given by the value of this property.
  ///
  /// When this isn't given, you need to match the delimiter eagerly
  /// using the [`findOpeningDelimiter`](#InlineContext.findOpeningDelimiter)
  /// and [`takeContent`](#InlineContext.takeContent) methods.
  resolve?: string;
  /// If the delimiter itself should, when matched, create a syntax
  /// node, set this to the name of the syntax node.
  mark?: string;
}
