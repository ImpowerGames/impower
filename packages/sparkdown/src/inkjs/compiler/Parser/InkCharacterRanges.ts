import { CharacterRange } from "./CharacterRange";
import { CharacterSet } from "./CharacterSet";

export abstract class InkCharacterRanges {
  private static _identifierCharSet: CharacterSet | null = null;

  static get identifierCharSet(): CharacterSet {
    if (this._identifierCharSet === null) {
      (this._identifierCharSet = new CharacterSet())
        .AddRange("A", "Z")
        .AddRange("a", "z")
        .AddRange("0", "9")
        .Add("_");

      // Enable non-ASCII characters for story identifiers.
      this.ExtendIdentifierCharacterRanges(this._identifierCharSet);
    }

    return this._identifierCharSet;
  }

  /**
   * Begin CharacterRanges section.
   */

  public static readonly LatinBasic: CharacterRange = CharacterRange.Define(
    "\u0041",
    "\u007A",
    new CharacterSet().AddRange("\u005B", "\u0060")
  );

  public static readonly LatinExtendedA: CharacterRange = CharacterRange.Define(
    "\u0100",
    "\u017F"
    // no excludes here
  );

  public static readonly LatinExtendedB: CharacterRange = CharacterRange.Define(
    "\u0180",
    "\u024F"
    // no excludes here
  );

  public static readonly Greek: CharacterRange = CharacterRange.Define(
    "\u0370",
    "\u03FF",
    new CharacterSet()
      .AddRange("\u0378", "\u0385")
      .AddCharacters("\u0374\u0375\u0378\u0387\u038B\u038D\u03A2")
  );

  public static readonly Cyrillic: CharacterRange = CharacterRange.Define(
    "\u0400",
    "\u04FF",
    new CharacterSet().AddRange("\u0482", "\u0489")
  );

  public static readonly Armenian: CharacterRange = CharacterRange.Define(
    "\u0530",
    "\u058F",
    new CharacterSet()
      .AddCharacters("\u0530")
      .AddRange("\u0557", "\u0560")
      .AddRange("\u0588", "\u058E")
  );

  public static readonly Hebrew: CharacterRange = CharacterRange.Define(
    "\u0590",
    "\u05FF",
    new CharacterSet()
  );

  public static readonly Arabic: CharacterRange = CharacterRange.Define(
    "\u0600",
    "\u06FF",
    new CharacterSet()
  );

  public static readonly Korean: CharacterRange = CharacterRange.Define(
    "\uAC00",
    "\uD7AF",
    new CharacterSet()
  );

  public static readonly Latin1Supplement: CharacterRange =
    CharacterRange.Define("\u0080", "\u00FF", new CharacterSet());

  public static readonly Chinese: CharacterRange = CharacterRange.Define(
    "\u4E00",
    "\u9FFF",
    new CharacterSet()
  );

  private static readonly ExtendIdentifierCharacterRanges = (
    identifierCharSet: CharacterSet
  ): void => {
    const characterRanges = this.ListAllCharacterRanges();
    for (const charRange of characterRanges) {
      identifierCharSet.AddCharacters(charRange.ToCharacterSet());
    }
  };

  /// <summary>
  /// Gets an array of <see cref="CharacterRange" /> representing all of the currently supported
  /// non-ASCII character ranges that can be used in identifier names.
  /// </summary>
  /// <returns>
  /// An array of <see cref="CharacterRange" /> representing all of the currently supported
  /// non-ASCII character ranges that can be used in identifier names.
  /// </returns>
  public static readonly ListAllCharacterRanges = (): CharacterRange[] => [
    this.LatinBasic,
    this.LatinExtendedA,
    this.LatinExtendedB,
    this.Arabic,
    this.Armenian,
    this.Cyrillic,
    this.Greek,
    this.Hebrew,
    this.Korean,
    this.Latin1Supplement,
    this.Chinese,
  ];

  /**
   * End CharacterRanges section.
   */
}
