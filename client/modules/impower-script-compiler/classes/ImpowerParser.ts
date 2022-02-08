import {
  Debug,
  DebugMetadata,
  ErrorType,
  Glue,
  StringBuilder,
  Tag,
} from "../../impower-script-engine";
import { Argument } from "../types/Argument";
import { CommandLineInput } from "../types/CommandLineInput";
import { CustomFlags } from "../types/CustomFlags";
import { ErrorHandler } from "../types/ErrorHandler";
import { Identifier } from "../types/Identifier";
import { ParseRule } from "../types/ParseRule";
import { SequenceType } from "../types/SequenceType";
import { SpecificParseRule } from "../types/SpecificParseRule";
import { StatementLevel } from "../types/StatementLevel";
import { CharacterRange } from "./CharacterRange";
import { CharacterSet } from "./CharacterSet";
import { CommentEliminator } from "./CommentEliminator";
import { FlowDecl } from "./FlowDecl";
import { InfixOperator } from "./InfixOperator";
import { ParsedAuthorWarning } from "./ParsedHierarchy/ParsedAuthorWarning";
import { ParsedBinaryExpression } from "./ParsedHierarchy/ParsedBinaryExpression";
import { ParsedChoice } from "./ParsedHierarchy/ParsedChoice";
import { ParsedConditional } from "./ParsedHierarchy/ParsedConditional";
import { ParsedConditionalSingleBranch } from "./ParsedHierarchy/ParsedConditionalSingleBranch";
import { ParsedConstantDeclaration } from "./ParsedHierarchy/ParsedConstantDeclaration";
import { ParsedContentList } from "./ParsedHierarchy/ParsedContentList";
import { ParsedDivert } from "./ParsedHierarchy/ParsedDivert";
import { ParsedDivertTarget } from "./ParsedHierarchy/ParsedDivertTarget";
import { ParsedExpression } from "./ParsedHierarchy/ParsedExpression";
import { ParsedExternalDeclaration } from "./ParsedHierarchy/ParsedExternalDeclaration";
import { ParsedFunctionCall } from "./ParsedHierarchy/ParsedFunctionCall";
import { ParsedGather } from "./ParsedHierarchy/ParsedGather";
import { ParsedGlue } from "./ParsedHierarchy/ParsedGlue";
import { ParsedIncDecExpression } from "./ParsedHierarchy/ParsedIncDecExpression";
import { ParsedKnot } from "./ParsedHierarchy/ParsedKnot";
import { ParsedList } from "./ParsedHierarchy/ParsedList";
import { ParsedListDefinition } from "./ParsedHierarchy/ParsedListDefinition";
import { ParsedListElementDefinition } from "./ParsedHierarchy/ParsedListElementDefinition";
import { ParsedMultipleConditionExpression } from "./ParsedHierarchy/ParsedMultipleConditionExpression";
import { ParsedNumber } from "./ParsedHierarchy/ParsedNumber";
import { ParsedObject } from "./ParsedHierarchy/ParsedObject";
import { ParsedPath } from "./ParsedHierarchy/ParsedPath";
import { ParsedReturn } from "./ParsedHierarchy/ParsedReturn";
import { ParsedSequence } from "./ParsedHierarchy/ParsedSequence";
import { ParsedStitch } from "./ParsedHierarchy/ParsedStitch";
import { ParsedStory } from "./ParsedHierarchy/ParsedStory";
import { ParsedStringExpression } from "./ParsedHierarchy/ParsedStringExpression";
import { ParsedTag } from "./ParsedHierarchy/ParsedTag";
import { ParsedText } from "./ParsedHierarchy/ParsedText";
import { ParsedTunnelOnwards } from "./ParsedHierarchy/ParsedTunnelOnwards";
import { ParsedUnaryExpression } from "./ParsedHierarchy/ParsedUnaryExpression";
import { ParsedVariableAssignment } from "./ParsedHierarchy/ParsedVariableAssignment";
import { ParsedVariableReference } from "./ParsedHierarchy/ParsedVariableReference";
import { StringParser } from "./StringParser";
import { StringParserElement } from "./StringParserElement";

export class ImpowerParser extends StringParser {
  private _externalErrorHandler: ErrorHandler;

  private _filename: string = null;

  private _rootParser: ImpowerParser = null;

  private _parsingChoice = false;

  private _inlineWhitespaceChars: CharacterSet = new CharacterSet(" \t");

  private _runtimePathCharacterSet: CharacterSet = null;

  private _nonTextPauseCharacters: CharacterSet = null;

  private _nonTextEndCharacters: CharacterSet = null;

  private _notTextEndCharactersChoice: CharacterSet = null;

  private _notTextEndCharactersString: CharacterSet = null;

  private _binaryOperators: InfixOperator[] = null;

  private _maxBinaryOpLength = 0;

  private _identifierCharSet: CharacterSet = null;

  private _statementRulesAtLevel: ParseRule[][] = null;

  private _statementBreakRulesAtLevel: ParseRule[][] = null;

  private _endOfTagCharSet = new CharacterSet("#\n\r\\");

  private _sequenceTypeSymbols = new CharacterSet("!&~$");

  protected get parsingStringExpression(): boolean {
    return this.GetFlag(CustomFlags.ParsingString);
  }

  protected set parsingStringExpression(value: boolean) {
    this.SetFlag(CustomFlags.ParsingString, value);
  }

  get identifierCharSet(): CharacterSet {
    if (this._identifierCharSet == null) {
      (this._identifierCharSet = new CharacterSet())
        .AddRange("A", "Z")
        .AddRange("a", "z")
        .AddRange("0", "9")
        .push("_");
      // Enable non-ASCII characters for story identifiers.
      this.ExtendIdentifierCharacterRanges(this._identifierCharSet);
    }
    return this._identifierCharSet;
  }

  static readonly LatinBasic: CharacterRange = CharacterRange.Define(
    "\u0041",
    "\u007A",
    new CharacterSet().AddRange("\u005B", "\u0060")
  );

  static readonly LatinExtendedA: CharacterRange = CharacterRange.Define(
    "\u0100",
    "\u017F"
  ); // no excludes here

  static readonly LatinExtendedB: CharacterRange = CharacterRange.Define(
    "\u0180",
    "\u024F"
  ); // no excludes here

  static readonly Greek: CharacterRange = CharacterRange.Define(
    "\u0370",
    "\u03FF",
    new CharacterSet()
      .AddRange("\u0378", "\u0385")
      .AddCharacters("\u0374\u0375\u0378\u0387\u038B\u038D\u03A2")
  );

  static readonly Cyrillic: CharacterRange = CharacterRange.Define(
    "\u0400",
    "\u04FF",
    new CharacterSet().AddRange("\u0482", "\u0489")
  );

  static readonly Armenian: CharacterRange = CharacterRange.Define(
    "\u0530",
    "\u058F",
    new CharacterSet()
      .AddCharacters("\u0530")
      .AddRange("\u0557", "\u0560")
      .AddRange("\u0588", "\u058E")
  );

  static readonly Hebrew: CharacterRange = CharacterRange.Define(
    "\u0590",
    "\u05FF",
    new CharacterSet()
  );

  static readonly Arabic: CharacterRange = CharacterRange.Define(
    "\u0600",
    "\u06FF",
    new CharacterSet()
  );

  static readonly Korean: CharacterRange = CharacterRange.Define(
    "\uAC00",
    "\uD7AF",
    new CharacterSet()
  );

  static readonly Latin1Supplement: CharacterRange = CharacterRange.Define(
    "\u0080",
    "\u00FF",
    new CharacterSet()
  );

  constructor(
    str: string,
    inkFilename: string = null,
    externalErrorHandler: ErrorHandler = null,
    rootParser: ImpowerParser = null
  ) {
    super(str);
    this._filename = inkFilename;
    this.RegisterExpressionOperators();
    this.GenerateStatementLevelRules();

    // Built in handler for all standard parse errors and warnings
    this.errorHandler = this.OnStringParserError;

    // The above parse errors are then formatted as strings and passed
    // to the Ink.ErrorHandler, or it throws an exception
    this._externalErrorHandler = externalErrorHandler;

    if (rootParser == null) {
      this._rootParser = this;
    } else {
      this._rootParser = rootParser;
    }
  }

  // Main entry point
  public Parse(): ParsedStory {
    const topLevelContent = this.StatementsAtLevel(StatementLevel.Top);

    // Note we used to return null if there were any errors, but this would mean
    // that include files would return completely empty rather than attempting to
    // continue with errors. Returning an empty include files meant that anything
    // that *did* compile successfully would otherwise be ignored, generating way
    // more errors than necessary.
    return new ParsedStory(topLevelContent, this._rootParser !== this);
  }

  protected SeparatedList<T>(
    mainRule: SpecificParseRule<T>,
    separatorRule: ParseRule
  ): T[] {
    const firstElement = this.ParseRule(mainRule);
    if (firstElement == null) return null;

    const allElements = [];
    allElements.push(firstElement);

    do {
      const nextElementRuleId = this.BeginRule();

      const sep = separatorRule();
      if (sep == null) {
        this.FailRule(nextElementRuleId);
        break;
      }

      const nextElement = this.ParseRule(mainRule);
      if (nextElement == null) {
        this.FailRule(nextElementRuleId);
        break;
      }

      this.SucceedRule(nextElementRuleId);

      allElements.push(nextElement);
    } while (allElements);

    return allElements;
  }

  protected override PreProcessInputString(str: string): string {
    const inputWithCommentsRemoved = new CommentEliminator(str).Process();
    return inputWithCommentsRemoved;
  }

  protected CreateDebugMetadata(
    stateAtStart: StringParserElement,
    stateAtEnd: StringParserElement
  ): DebugMetadata {
    const md = new DebugMetadata();
    md.startLineNumber = stateAtStart.lineIndex + 1;
    md.endLineNumber = stateAtEnd.lineIndex + 1;
    md.startCharacterNumber = stateAtStart.characterInLineIndex + 1;
    md.endCharacterNumber = stateAtEnd.characterInLineIndex + 1;
    md.fileName = this._filename;
    return md;
  }

  protected override RuleDidSucceed(
    result: unknown,
    stateAtStart: StringParserElement,
    stateAtEnd: StringParserElement
  ): void {
    // Apply DebugMetadata based on the state at the start of the rule
    // (i.e. use line number as it was at the start of the rule)
    const parsedObj = result as ParsedObject;
    if (parsedObj) {
      parsedObj.debugMetadata = this.CreateDebugMetadata(
        stateAtStart,
        stateAtEnd
      );
      return;
    }

    // A list of objects that doesn't already have metadata?
    const parsedListObjs = result as ParsedObject[];
    if (parsedListObjs != null) {
      parsedListObjs.forEach((parsedListObj) => {
        if (!parsedListObj.hasOwnDebugMetadata) {
          parsedListObj.debugMetadata = this.CreateDebugMetadata(
            stateAtStart,
            stateAtEnd
          );
        }
      });
    }

    const id = result as Identifier;
    if (id != null) {
      id.debugMetadata = this.CreateDebugMetadata(stateAtStart, stateAtEnd);
    }
  }

  private OnStringParserError(
    message: string,
    index: number,
    lineIndex: number,
    isWarning: boolean
  ): void {
    const warningType = isWarning ? "WARNING:" : "ERROR:";
    let fullMessage: string;

    if (this._filename != null) {
      fullMessage = `${warningType} '${this._filename}' line ${
        lineIndex + 1
      }: ${message}`;
    } else {
      fullMessage = `${warningType} line ${lineIndex + 1}: ${message}`;
    }

    if (this._externalErrorHandler != null) {
      this._externalErrorHandler(
        fullMessage,
        isWarning ? ErrorType.Warning : ErrorType.Error
      );
    } else {
      throw new Error(fullMessage);
    }
  }

  protected AuthorWarning(): ParsedAuthorWarning {
    this.Whitespace();

    const identifier = this.ParseRule(this.IdentifierWithMetadata);
    if (identifier == null || identifier.name !== "TODO") {
      return null;
    }

    this.Whitespace();

    this.ParseString(":");

    this.Whitespace();

    const message = this.ParseUntilCharactersFromString("\n\r");

    return new ParsedAuthorWarning(message);
  }

  private ExtendIdentifierCharacterRanges(
    identifierCharSet: CharacterSet
  ): void {
    const characterRanges = ImpowerParser.ListAllCharacterRanges();
    characterRanges.forEach((charRange) => {
      identifierCharSet.AddCharacters(charRange.ToCharacterSet());
    });
  }

  /// <summary>
  /// Gets an array of <see cref="CharacterRange" /> representing all of the currently supported
  /// non-ASCII character ranges that can be used in identifier names.
  /// </summary>
  /// <returns>
  /// An array of <see cref="CharacterRange" /> representing all of the currently supported
  /// non-ASCII character ranges that can be used in identifier names.
  /// </returns>
  public static ListAllCharacterRanges(): CharacterRange[] {
    return [
      ImpowerParser.LatinBasic,
      ImpowerParser.LatinExtendedA,
      ImpowerParser.LatinExtendedB,
      ImpowerParser.Arabic,
      ImpowerParser.Armenian,
      ImpowerParser.Cyrillic,
      ImpowerParser.Greek,
      ImpowerParser.Hebrew,
      ImpowerParser.Korean,
      ImpowerParser.Latin1Supplement,
    ];
  }

  protected Choice(): ParsedChoice {
    let onceOnlyChoice = true;
    let bullets = this.Interleave<string>(
      this.OptionalExclude(this.Whitespace),
      this.String("*")
    );
    if (bullets == null) {
      bullets = this.Interleave<string>(
        this.OptionalExclude(this.Whitespace),
        this.String("+")
      );
      if (bullets == null) {
        return null;
      }

      onceOnlyChoice = false;
    }

    // Optional name for the choice
    const optionalName = this.ParseRule<Identifier>(this.BracketedName);

    this.Whitespace();

    // Optional condition for whether the choice should be shown to the player
    const conditionExpr = this.ParseRule<ParsedExpression>(
      this.ChoiceCondition
    );

    this.Whitespace();

    // Ordinarily we avoid parser state variables like these, since
    // nesting would require us to store them in a stack. But since you should
    // never be able to nest choices within choice content, it's fine here.
    Debug.Assert(
      this._parsingChoice === false,
      "Already parsing a choice - shouldn't have nested choices"
    );
    this._parsingChoice = true;

    let startContent: ParsedContentList = null;
    const startTextAndLogic = this.ParseRule(this.MixedTextAndLogic);
    if (startTextAndLogic != null) {
      startContent = new ParsedContentList(...startTextAndLogic);
    }

    let optionOnlyContent: ParsedContentList = null;
    let innerContent: ParsedContentList = null;

    // Check for a the weave style format:
    //   * "Hello[."]," he said.
    const hasWeaveStyleInlineBrackets = this.ParseString("[") != null;
    if (hasWeaveStyleInlineBrackets) {
      const optionOnlyTextAndLogic = this.ParseRule(this.MixedTextAndLogic);
      if (optionOnlyTextAndLogic != null)
        optionOnlyContent = new ParsedContentList(...optionOnlyTextAndLogic);

      this.Expect(this.String("]"), "closing ']' for weave-style option");

      const innerTextAndLogic = this.ParseRule(this.MixedTextAndLogic);
      if (innerTextAndLogic != null)
        innerContent = new ParsedContentList(...innerTextAndLogic);
    }

    this.Whitespace();

    // Finally, now we know we're at the end of the main choice body, parse
    // any diverts separately.
    const diverts = this.ParseRule(this.MultiDivert);

    this._parsingChoice = false;

    this.Whitespace();

    // Completely empty choice without even an empty divert?
    const emptyContent = !startContent && !innerContent && !optionOnlyContent;
    if (emptyContent && diverts == null) {
      this.Warning(
        "Choice is completely empty. Interpretting as a default fallback choice. Add a divert arrow to remove this warning: * ->"
      );
    }

    // * [] some text
    else if (
      !startContent &&
      hasWeaveStyleInlineBrackets &&
      !optionOnlyContent
    ) {
      this.Warning(
        "Blank choice - if you intended a default fallback choice, use the `* ->` syntax"
      );
    }

    if (!innerContent) {
      innerContent = new ParsedContentList();
    }

    const tags = this.ParseRule<ParsedTag[]>(this.Tags);
    if (tags != null) {
      innerContent.AddContent(tags);
    }

    // Normal diverts on the end of a choice - simply add to the normal content
    if (diverts != null) {
      diverts.forEach((divObj) => {
        // may be TunnelOnwards
        const div = divObj as ParsedDivert;

        // Empty divert serves no purpose other than to say
        // "this choice is intentionally left blank"
        // (as an invisible default choice)
        if (!div || !div.isEmpty) {
          innerContent.AddContent(divObj);
        }
      });
    }

    // Terminate main content with a newline since this is the end of the line
    // Note that this will be redundant if the diverts above definitely take
    // the flow away permanently.
    innerContent.AddContent(new ParsedText("\n"));

    const choice = new ParsedChoice(
      startContent,
      optionOnlyContent,
      innerContent
    );
    choice.identifier = optionalName;
    choice.indentationDepth = bullets.length;
    choice.hasWeaveStyleInlineBrackets = hasWeaveStyleInlineBrackets;
    choice.condition = conditionExpr;
    choice.onceOnly = onceOnlyChoice;
    choice.isInvisibleDefault = emptyContent;

    return choice;
  }

  protected ChoiceCondition(): ParsedExpression {
    const conditions = this.Interleave<ParsedExpression>(
      this.ChoiceSingleCondition,
      this.ChoiceConditionsSpace
    );
    if (conditions == null) return null;
    if (conditions.length === 1) return conditions[0];

    return new ParsedMultipleConditionExpression(conditions);
  }

  protected ChoiceConditionsSpace(): unknown {
    // Both optional
    // Newline includes initial end of line whitespace
    this.Newline();
    this.Whitespace();
    return StringParser.ParseSuccess;
  }

  protected ChoiceSingleCondition(): ParsedExpression {
    if (this.ParseString("{") == null) {
      return null;
    }

    const condExpr = this.Expect(
      this.Expression,
      "choice condition inside { }"
    ) as ParsedExpression;
    this.DisallowIncrement(condExpr);

    this.Expect(this.String("}"), "closing '}' for choice condition");

    return condExpr;
  }

  protected Gather(): ParsedGather {
    const gatherDashCountObj = this.ParseRule(this.GatherDashes);
    if (gatherDashCountObj == null) {
      return null;
    }

    const gatherDashCount = gatherDashCountObj as number;

    // Optional name for the gather
    const optionalName = this.ParseRule<Identifier>(this.BracketedName);

    const gather = new ParsedGather(optionalName, gatherDashCount);

    // Optional newline before gather's content begins
    this.Newline();

    return gather;
  }

  protected GatherDashes(): unknown {
    this.Whitespace();

    let gatherDashCount = 0;

    while (this.ParseDashNotArrow() != null) {
      gatherDashCount += 1;
      this.Whitespace();
    }

    if (gatherDashCount === 0) {
      return null;
    }

    return gatherDashCount;
  }

  protected ParseDashNotArrow(): unknown {
    const ruleId = this.BeginRule();

    if (this.ParseString("->") == null && this.ParseSingleCharacter() === "-") {
      return this.SucceedRule(ruleId);
    }
    return this.FailRule(ruleId);
  }

  protected BracketedName(): Identifier {
    if (this.ParseString("(") == null) return null;

    this.Whitespace();

    const name = this.ParseRule<Identifier>(this.IdentifierWithMetadata);
    if (name == null) return null;

    this.Whitespace();

    this.Expect(this.String(")"), "closing ')' for bracketed name");

    return name;
  }

  // Valid returned objects:
  //  - "help"
  //  - int: for choice number
  //  - Parsed.Divert
  //  - Variable declaration/assignment
  //  - Epression
  //  - Lookup debug source for character offset
  //  - Lookup debug source for runtime path
  public CommandLineUserInput(): CommandLineInput {
    const result: CommandLineInput = {
      isHelp: false,
      isExit: false,
      choiceInput: 0,
      debugSource: 0,
      debugPathLookup: null,
      userImmediateModeStatement: null,
    };

    this.Whitespace();

    if (this.ParseString("help") != null) {
      result.isHelp = true;
      return result;
    }

    if (this.ParseString("exit") != null || this.ParseString("quit") != null) {
      result.isExit = true;
      return result;
    }

    return this.OneOf(
      this.DebugSource,
      this.DebugPathLookup,
      this.UserChoiceNumber,
      this.UserImmediateModeStatement
    ) as CommandLineInput;
  }

  DebugSource(): CommandLineInput {
    this.Whitespace();

    if (this.ParseString("DebugSource") == null) {
      return null;
    }

    this.Whitespace();

    const expectMsg = "character offset in parentheses, e.g. DebugSource(5)";
    if (this.Expect(this.String("("), expectMsg) == null) {
      return null;
    }

    this.Whitespace();

    const characterOffset = this.ParseInt();
    if (characterOffset == null) {
      this.Error(expectMsg);
      return null;
    }

    this.Whitespace();

    this.Expect(this.String(")"), "closing parenthesis");

    const inputStruct: CommandLineInput = {
      isHelp: false,
      isExit: false,
      choiceInput: 0,
      debugSource: 0,
      debugPathLookup: null,
      userImmediateModeStatement: null,
    };
    inputStruct.debugSource = characterOffset;
    return inputStruct;
  }

  DebugPathLookup(): CommandLineInput {
    this.Whitespace();

    if (this.ParseString("DebugPath") == null) {
      return null;
    }

    if (this.Whitespace() == null) {
      return null;
    }

    const pathStr = this.Expect(this.RuntimePath, "path") as string;

    const inputStruct = {
      isHelp: false,
      isExit: false,
      choiceInput: 0,
      debugSource: 0,
      debugPathLookup: null,
      userImmediateModeStatement: null,
    };
    inputStruct.debugPathLookup = pathStr;
    return inputStruct;
  }

  RuntimePath(): string {
    if (this._runtimePathCharacterSet == null) {
      this._runtimePathCharacterSet = new CharacterSet(this.identifierCharSet);
      this._runtimePathCharacterSet.push("-"); // for c-0, g-0 etc
      this._runtimePathCharacterSet.push(".");
    }

    return this.ParseCharactersFromCharSet(this._runtimePathCharacterSet);
  }

  UserChoiceNumber(): CommandLineInput {
    this.Whitespace();

    const number = this.ParseInt();
    if (number == null) {
      return null;
    }

    this.Whitespace();

    if (this.ParseRule(this.EndOfLine) == null) {
      return null;
    }

    const inputStruct = {
      isHelp: false,
      isExit: false,
      choiceInput: 0,
      debugSource: 0,
      debugPathLookup: null,
      userImmediateModeStatement: null,
    };
    inputStruct.choiceInput = number;
    return inputStruct;
  }

  UserImmediateModeStatement(): CommandLineInput {
    const statement = this.OneOf(
      this.SingleDivert,
      this.TempDeclarationOrAssignment,
      this.Expression
    );

    const inputStruct = {
      isHelp: false,
      isExit: false,
      choiceInput: 0,
      debugSource: 0,
      debugPathLookup: null,
      userImmediateModeStatement: null,
    };
    inputStruct.userImmediateModeStatement = statement;
    return inputStruct;
  }

  protected InnerConditionalContent(
    initialQueryExpression?: ParsedExpression
  ): ParsedConditional {
    if (initialQueryExpression === undefined) {
      initialQueryExpression = this.ParseRule(this.ConditionExpression);
    }

    let alternatives: ParsedConditionalSingleBranch[] = [];

    const canBeInline = initialQueryExpression != null;
    const isInline = this.ParseRule(this.Newline) == null;

    if (isInline && !canBeInline) {
      return null;
    }

    // Inline innards
    if (isInline) {
      alternatives = this.InlineConditionalBranches();
    }

    // Multiline innards
    else {
      alternatives = this.MultilineConditionalBranches();
      if (alternatives == null) {
        // Allow single piece of content within multi-line expression, e.g.:
        // { true:
        //    Some content that isn't preceded by '-'
        // }
        if (initialQueryExpression) {
          const soleContent = this.StatementsAtLevel(StatementLevel.InnerBlock);
          if (soleContent != null) {
            const soleBranch = new ParsedConditionalSingleBranch(soleContent);
            alternatives = [];
            alternatives.push(soleBranch);

            // Also allow a final "- else:" clause
            const elseBranch = this.ParseRule(this.SingleMultilineCondition);
            if (elseBranch) {
              if (!elseBranch.isElse) {
                this.ErrorWithParsedObject(
                  "Expected an '- else:' clause here rather than an extra condition",
                  elseBranch
                );
                elseBranch.isElse = true;
              }
              alternatives.push(elseBranch);
            }
          }
        }

        // Still null?
        if (alternatives == null) {
          return null;
        }
      }

      // Empty true branch - didn't get parsed, but should insert one for semantic correctness,
      // and to make sure that any evaluation stack values get tidied up correctly.
      else if (
        alternatives.length === 1 &&
        alternatives[0].isElse &&
        initialQueryExpression
      ) {
        const emptyTrueBranch = new ParsedConditionalSingleBranch(null);
        emptyTrueBranch.isTrueBranch = true;
        alternatives.unshift(emptyTrueBranch);
      }

      // Like a switch statement
      // { initialQueryExpression:
      //    ... match the expression
      // }
      if (initialQueryExpression) {
        let earlierBranchesHaveOwnExpression = false;
        for (let i = 0; i < alternatives.length; i += 1) {
          const branch = alternatives[i];
          const isLast = i === alternatives.length - 1;

          // Matching equality with initial query expression
          // We set this flag even for the "else" clause so that
          // it knows to tidy up the evaluation stack at the end

          // Match query
          if (branch.ownExpression) {
            branch.matchingEquality = true;
            earlierBranchesHaveOwnExpression = true;
          }

          // Else (final branch)
          else if (earlierBranchesHaveOwnExpression && isLast) {
            branch.matchingEquality = true;
            branch.isElse = true;
          }

          // Binary condition:
          // { trueOrFalse:
          //    - when true
          //    - when false
          // }
          else if (!isLast && alternatives.length > 2) {
            this.ErrorWithParsedObject(
              "Only final branch can be an 'else'. Did you miss a ':'?",
              branch
            );
          } else if (i === 0) {
            branch.isTrueBranch = true;
          } else {
            branch.isElse = true;
          }
        }
      }

      // No initial query, so just a multi-line conditional. e.g.:
      // {
      //   - x > 3:  greater than three
      //   - x == 3: equal to three
      //   - x < 3:  less than three
      // }
      else {
        for (let i = 0; i < alternatives.length; i += 1) {
          const alt = alternatives[i];
          const isLast = i === alternatives.length - 1;
          if (alt.ownExpression == null) {
            if (isLast) {
              alt.isElse = true;
            } else if (alt.isElse) {
              // Do we ALSO have a valid "else" at the end? Let's report the error there.
              const finalClause = alternatives[alternatives.length - 1];
              if (finalClause.isElse) {
                this.ErrorWithParsedObject(
                  "Multiple 'else' cases. Can have a maximum of one, at the end.",
                  finalClause
                );
              } else {
                this.ErrorWithParsedObject(
                  "'else' case in conditional should always be the final one",
                  alt
                );
              }
            } else {
              this.ErrorWithParsedObject(
                "Branch doesn't have condition. Are you missing a ':'? ",
                alt
              );
            }
          }
        }

        if (
          alternatives.length === 1 &&
          alternatives[0].ownExpression == null
        ) {
          this.ErrorWithParsedObject(
            "Condition block with no conditions",
            alternatives[0]
          );
        }
      }
    }

    // TODO: Come up with water-tight error conditions... it's quite a flexible system!
    // e.g.
    //   - inline conditionals must have exactly 1 or 2 alternatives
    //   - multiline expression shouldn't have mixed existence of branch-conditions?
    if (alternatives == null) {
      return null;
    }

    alternatives.forEach((branch) => {
      branch.isInline = isInline;
    });

    const cond = new ParsedConditional(initialQueryExpression, alternatives);
    return cond;
  }

  protected InlineConditionalBranches(): ParsedConditionalSingleBranch[] {
    const listOfLists = this.Interleave<ParsedObject[]>(
      this.MixedTextAndLogic,
      this.Exclude(this.String("|")),
      null,
      false
    );
    if (listOfLists == null || listOfLists.length === 0) {
      return null;
    }

    const result: ParsedConditionalSingleBranch[] = [];

    if (listOfLists.length > 2) {
      this.Error(
        "Expected one or two alternatives separated by '|' in inline conditional"
      );
    } else {
      const trueBranch = new ParsedConditionalSingleBranch(listOfLists[0]);
      trueBranch.isTrueBranch = true;
      result.push(trueBranch);

      if (listOfLists.length > 1) {
        const elseBranch = new ParsedConditionalSingleBranch(listOfLists[1]);
        elseBranch.isElse = true;
        result.push(elseBranch);
      }
    }

    return result;
  }

  protected MultilineConditionalBranches(): ParsedConditionalSingleBranch[] {
    this.MultilineWhitespace();

    const multipleConditions = this.OneOrMore(this.SingleMultilineCondition);
    if (multipleConditions == null) {
      return null;
    }

    this.MultilineWhitespace();

    return multipleConditions as ParsedConditionalSingleBranch[];
  }

  protected SingleMultilineCondition(): ParsedConditionalSingleBranch {
    this.Whitespace();

    // Make sure we're not accidentally parsing a divert
    if (this.ParseString("->") != null) return null;

    if (this.ParseString("-") == null) return null;

    this.Whitespace();

    let expr = null;
    const isElse = this.ParseRule(this.ElseExpression) != null;

    if (!isElse) expr = this.ParseRule(this.ConditionExpression);

    let content = this.StatementsAtLevel(
      StatementLevel.InnerBlock
    ) as ParsedObject[];
    if (expr == null && content == null) {
      this.Error("expected content for the conditional branch following '-'");

      // Recover
      content = [];
      content.push(new ParsedText(""));
    }

    // Allow additional multiline whitespace, if the statements were empty (valid)
    // then their surrounding multiline whitespacce needs to be handled manually.
    // e.g.
    // { x:
    //   - 1:    // intentionally left blank, but newline needs to be parsed
    //   - 2: etc
    // }
    this.MultilineWhitespace();

    const branch = new ParsedConditionalSingleBranch(content);
    branch.ownExpression = expr;
    branch.isElse = isElse;
    return branch;
  }

  protected ConditionExpression(): ParsedExpression {
    const expr = this.ParseRule<ParsedExpression>(this.Expression);
    if (expr == null) {
      return null;
    }

    this.DisallowIncrement(expr);

    this.Whitespace();

    if (this.ParseString(":") == null) {
      return null;
    }

    return expr;
  }

  protected ElseExpression(): unknown {
    if (this.ParseString("else") == null) return null;

    this.Whitespace();

    if (this.ParseString(":") == null) return null;

    return StringParser.ParseSuccess;
  }

  private TrimEndWhitespace(
    mixedTextAndLogicResults: ParsedObject[],
    terminateWithSpace: boolean
  ): void {
    // Trim whitespace from end
    if (mixedTextAndLogicResults.length > 0) {
      const lastObjIdx = mixedTextAndLogicResults.length - 1;
      const lastObj = mixedTextAndLogicResults[lastObjIdx];
      if (lastObj instanceof ParsedText) {
        const text = lastObj;
        text.text = text.text.trimEnd();

        if (terminateWithSpace) {
          text.text += " ";
        }

        // No content left at all? trim the whole object
        else if (text.text.length === 0) {
          mixedTextAndLogicResults.splice(lastObjIdx, 1);

          // Recurse in case there's more whitespace
          this.TrimEndWhitespace(mixedTextAndLogicResults, false);
        }
      }
    }
  }

  protected LineOfMixedTextAndLogic(): ParsedObject[] {
    // Consume any whitespace at the start of the line
    // (Except for escaped whitespace)
    this.ParseRule(this.Whitespace);

    let result = this.ParseRule<ParsedObject[]>(this.MixedTextAndLogic);

    // Terminating tag
    let onlyTags = false;
    const tags = this.ParseRule<ParsedTag[]>(this.Tags);
    if (tags != null) {
      if (result == null) {
        result = tags;
        onlyTags = true;
      } else {
        tags.forEach((tag) => {
          result.push(tag);
        });
      }
    }

    if (result == null || result.length === 0) return null;

    // Warn about accidentally writing "return" without "~"
    const firstText = result[0] as ParsedText;
    if (firstText) {
      if (firstText.text.startsWith("return")) {
        this.Warning(
          "Do you need a '~' before 'return'? If not, perhaps use a glue: <> (since it's lowercase) or rewrite somehow?"
        );
      }
    }
    if (result.length === 0) return null;

    const lastObj = result[result.length - 1];
    if (!(lastObj instanceof ParsedDivert)) {
      this.TrimEndWhitespace(result, false);
    }

    // Add newline since it's the end of the line
    // (so long as it's a line with only tags)
    if (!onlyTags) result.push(new ParsedText("\n"));

    this.Expect(this.EndOfLine, "end of line", this.SkipToNextLine);

    return result;
  }

  protected MixedTextAndLogic(): ParsedObject[] {
    // Check for disallowed "~" within this context
    const disallowedTilda = this.ParseObject(this.Spaced(this.String("~")));
    if (disallowedTilda != null) {
      this.Error(
        "You shouldn't use a '~' here - tildas are for logic that's on its own line. To do inline logic, use { curly braces } instead"
      );
    }

    // Either, or both interleaved
    let results = this.Interleave<ParsedObject>(
      this.Optional(this.ContentText),
      this.Optional(this.InlineLogicOrGlue)
    );

    // Terminating divert?
    // (When parsing content for the text of a choice, diverts aren't allowed.
    //  The divert on the end of the body of a choice is handled specially.)
    if (!this._parsingChoice) {
      const diverts = this.ParseRule(this.MultiDivert);
      if (diverts != null) {
        // May not have had any results at all if there's *only* a divert!
        if (results == null) results = [];

        this.TrimEndWhitespace(results, true);

        results.push(...diverts);
      }
    }

    if (results == null) return null;

    return results;
  }

  protected ContentText(): ParsedText {
    return this.ContentTextAllowingEcapeChar();
  }

  protected ContentTextAllowingEcapeChar(): ParsedText {
    let sb: StringBuilder = null;

    do {
      const str = this.ParseRule(this.ContentTextNoEscape);
      const gotEscapeChar = this.ParseString("\\") != null;

      if (gotEscapeChar || str != null) {
        if (sb == null) {
          sb = new StringBuilder();
        }

        if (str != null) {
          sb.Append(str);
        }

        if (gotEscapeChar) {
          const c = this.ParseSingleCharacter();
          sb.Append(c);
        }
      } else {
        break;
      }
    } while (sb);

    if (sb != null) {
      return new ParsedText(sb.ToString());
    }
    return null;
  }

  // Content text is an unusual parse rule compared with most since it's
  // less about saying "this is is the small selection of stuff that we parse"
  // and more "we parse ANYTHING except this small selection of stuff".
  protected ContentTextNoEscape(): string {
    // Eat through text, pausing at the following characters, and
    // attempt to parse the nonTextRule.
    // "-": possible start of divert or start of gather
    // "<": possible start of glue
    if (this._nonTextPauseCharacters == null) {
      this._nonTextPauseCharacters = new CharacterSet("-<");
    }

    // If we hit any of these characters, we stop *immediately* without bothering to even check the nonTextRule
    // "{" for start of logic
    // "|" for mid logic branch
    if (this._nonTextEndCharacters == null) {
      this._nonTextEndCharacters = new CharacterSet("{}|\n\r\\#");
      this._notTextEndCharactersChoice = new CharacterSet(
        this._nonTextEndCharacters
      );
      this._notTextEndCharactersChoice.AddCharacters("[]");
      this._notTextEndCharactersString = new CharacterSet(
        this._nonTextEndCharacters
      );
      this._notTextEndCharactersString.AddCharacters('"');
    }

    // When the ParseUntil pauses, check these rules in case they evaluate successfully
    const nonTextRule = (): unknown =>
      this.OneOf(
        this.ParseDivertArrow,
        this.ParseThreadArrow,
        this.EndOfLine,
        this.Glue
      );

    let endChars: CharacterSet = null;
    if (this.parsingStringExpression) {
      endChars = this._notTextEndCharactersString;
    } else if (this._parsingChoice) {
      endChars = this._notTextEndCharactersChoice;
    } else {
      endChars = this._nonTextEndCharacters;
    }

    const pureTextContent = this.ParseUntil(
      nonTextRule,
      this._nonTextPauseCharacters,
      endChars
    );
    if (pureTextContent != null) {
      return pureTextContent;
    }
    return null;
  }

  protected MultiDivert(): ParsedObject[] {
    this.Whitespace();

    let diverts: ParsedObject[] = null;

    // Try single thread first
    const threadDivert = this.ParseRule(this.StartThread);
    if (threadDivert) {
      diverts = [];
      diverts.push(threadDivert);
      return diverts;
    }

    // Normal diverts and tunnels
    const arrowsAndDiverts = this.Interleave<unknown>(
      this.ParseDivertArrowOrTunnelOnwards,
      this.DivertIdentifierWithArguments
    );

    if (arrowsAndDiverts == null) {
      return null;
    }

    diverts = [];

    // Possible patterns:
    //  ->                   -- explicit gather
    //  ->->                 -- tunnel onwards
    //  -> div               -- normal divert
    //  ->-> div             -- tunnel onwards, followed by override divert
    //  -> div ->            -- normal tunnel
    //  -> div ->->          -- tunnel then tunnel continue
    //  -> div -> div        -- tunnel then divert
    //  -> div -> div ->     -- tunnel then tunnel
    //  -> div -> div ->->
    //  -> div -> div ->-> div    (etc)

    // Look at the arrows and diverts
    for (let i = 0; i < arrowsAndDiverts.length; i += 1) {
      const isArrow = i % 2 === 0;

      // Arrow string
      if (isArrow) {
        // Tunnel onwards
        if (arrowsAndDiverts[i] === "->->") {
          const tunnelOnwardsPlacementValid =
            i === 0 ||
            i === arrowsAndDiverts.length - 1 ||
            i === arrowsAndDiverts.length - 2;
          if (!tunnelOnwardsPlacementValid) {
            this.Error(
              "Tunnel onwards '->->' must only come at the begining or the start of a divert"
            );
          }

          const tunnelOnwards = new ParsedTunnelOnwards();
          if (i < arrowsAndDiverts.length - 1) {
            const tunnelOnwardDivert = arrowsAndDiverts[i + 1] as ParsedDivert;
            tunnelOnwards.divertAfter = tunnelOnwardDivert;
          }

          diverts.push(tunnelOnwards);

          // Not allowed to do anything after a tunnel onwards.
          // If we had anything left it would be caused in the above Error for
          // the positioning of a ->->
          break;
        }
      }

      // Divert
      else {
        const divert = arrowsAndDiverts[i] as ParsedDivert;

        // More to come? (further arrows) Must be tunnelling.
        if (i < arrowsAndDiverts.length - 1) {
          divert.isTunnel = true;
        }

        diverts.push(divert);
      }
    }

    // Single -> (used for default choices)
    if (diverts.length === 0 && arrowsAndDiverts.length === 1) {
      const gatherDivert = new ParsedDivert(null);
      gatherDivert.isEmpty = true;
      diverts.push(gatherDivert);

      if (!this._parsingChoice) {
        this.Error("Empty diverts (->) are only valid on choices");
      }
    }

    return diverts;
  }

  protected StartThread(): ParsedDivert {
    this.Whitespace();

    if (this.ParseThreadArrow() == null) {
      return null;
    }

    this.Whitespace();

    const divert = this.Expect(
      this.DivertIdentifierWithArguments,
      "target for new thread",
      () => new ParsedDivert(null)
    ) as ParsedDivert;
    divert.isThread = true;

    return divert;
  }

  protected DivertIdentifierWithArguments(): ParsedDivert {
    this.Whitespace();

    const targetComponents = this.ParseRule<Identifier[]>(
      this.DotSeparatedDivertPathComponents
    );
    if (targetComponents == null) {
      return null;
    }

    this.Whitespace();

    const optionalArguments = this.ParseRule<ParsedExpression[]>(
      this.ExpressionFunctionCallArguments
    );

    this.Whitespace();

    const targetPath = new ParsedPath(targetComponents);
    return new ParsedDivert(targetPath, null, optionalArguments);
  }

  protected SingleDivert(): ParsedDivert {
    const diverts = this.ParseRule(this.MultiDivert);
    if (diverts == null) {
      return null;
    }

    // Ideally we'd report errors if we get the
    // wrong kind of divert, but unfortunately we
    // have to hack around the fact that sequences use
    // a very similar syntax.
    // i.e. if you have a multi-divert at the start
    // of a sequence, it initially tries to parse it
    // as a divert target (part of an expression of
    // a conditional) and gives errors. So instead
    // we just have to blindly reject it as a single
    // divert, and give a slightly less nice error
    // when you DO use a multi divert as a divert taret.

    if (diverts.length !== 1) {
      return null;
    }

    const singleDivert = diverts[0];
    if (singleDivert instanceof ParsedTunnelOnwards) {
      return null;
    }

    const divert = diverts[0] as ParsedDivert;
    if (divert.isTunnel) {
      return null;
    }

    return divert;
  }

  private DotSeparatedDivertPathComponents(): Identifier[] {
    return this.Interleave<Identifier>(
      this.Spaced(this.IdentifierWithMetadata),
      this.Exclude(this.String("."))
    );
  }

  protected ParseDivertArrowOrTunnelOnwards(): string {
    let numArrows = 0;
    while (this.ParseString("->") !== null) {
      numArrows += 1;
    }

    if (numArrows === 0) {
      return null;
    }
    if (numArrows === 1) {
      return "->";
    }
    if (numArrows === 2) {
      return "->->";
    }
    this.Error(
      "Unexpected number of arrows in divert. Should only have '->' or '->->'"
    );
    return "->->";
  }

  protected ParseDivertArrow(): string {
    return this.ParseString("->");
  }

  protected ParseThreadArrow(): string {
    return this.ParseString("<-");
  }

  protected TempDeclarationOrAssignment(): ParsedObject {
    this.Whitespace();

    const isNewDeclaration = this.ParseTempKeyword();

    this.Whitespace();

    let varIdentifier: Identifier = null;
    if (isNewDeclaration) {
      varIdentifier = this.Expect(
        this.IdentifierWithMetadata,
        "variable name"
      ) as Identifier;
    } else {
      varIdentifier = this.ParseRule(this.IdentifierWithMetadata);
    }

    if (varIdentifier == null) {
      return null;
    }

    this.Whitespace();

    // += -=
    const isIncrement = this.ParseString("+") != null;
    const isDecrement = this.ParseString("-") != null;
    if (isIncrement && isDecrement) {
      this.Error("Unexpected sequence '+-'");
    }

    if (this.ParseString("=") == null) {
      // Definitely in an assignment expression?
      if (isNewDeclaration) {
        this.Error("Expected '='");
      }
      return null;
    }

    const assignedExpression = this.Expect(
      this.Expression,
      "value expression to be assigned"
    ) as ParsedExpression;

    if (isIncrement || isDecrement) {
      return new ParsedIncDecExpression(
        varIdentifier,
        isIncrement,
        assignedExpression
      );
    }
    const result = new ParsedVariableAssignment(
      varIdentifier,
      assignedExpression
    );
    result.isNewTemporaryDeclaration = isNewDeclaration;
    return result;
  }

  protected DisallowIncrement(expr: ParsedObject): void {
    if (expr instanceof ParsedIncDecExpression) {
      this.Error(
        "Can't use increment/decrement here. It can only be used on a ~ line"
      );
    }
  }

  protected ParseTempKeyword(): boolean {
    const ruleId = this.BeginRule();

    if (this.ParseRule(this.Identifier) === "temp") {
      this.SucceedRule(ruleId);
      return true;
    }
    this.FailRule(ruleId);
    return false;
  }

  protected ReturnStatement(): ParsedReturn {
    this.Whitespace();

    const returnOrDone = this.ParseRule(this.Identifier);
    if (returnOrDone !== "return") {
      return null;
    }

    this.Whitespace();

    const expr = this.ParseRule(this.Expression);

    const returnObj = new ParsedReturn(expr);
    return returnObj;
  }

  // Pratt Parser
  // aka "Top down operator precedence parser"
  // http://journal.stuffwithstuff.com/2011/03/19/pratt-parsers-expression-parsing-made-easy/
  // Algorithm overview:
  // The two types of precedence are handled in two different ways:
  //   ((((a . b) . c) . d) . e)			#1
  //   (a . (b . (c . (d . e))))			#2
  // Where #1 is automatically handled by successive loops within the main 'while' in this function,
  // so long as continuing operators have lower (or equal) precedence (e.g. imagine some series of "*"s then "+" above.
  // ...and #2 is handled by recursion of the right hand term in the binary expression parser.
  // (see link for advice on how to extend for postfix and mixfix operators)
  protected Expression(minimumPrecedence = 0): ParsedExpression {
    this.Whitespace();

    // First parse a unary expression e.g. "-a" or parethensised "(1 + 2)"
    let expr = this.ExpressionUnary();
    if (expr == null) {
      return null;
    }

    this.Whitespace();

    // Attempt to parse (possibly multiple) continuing infix expressions (e.g. 1 + 2 + 3)
    while (this) {
      const ruleId = this.BeginRule();

      // Operator
      const infixOp = this.ParseInfixOperator();
      if (infixOp != null && infixOp.precedence > minimumPrecedence) {
        // Expect right hand side of operator
        const expectationMessage = `right side of '${infixOp.type}' expression`;
        const left = expr;
        const multiaryExpr = this.Expect(
          (): ParsedExpression => this.ExpressionInfixRight(left, infixOp),
          expectationMessage
        );
        if (multiaryExpr == null) {
          // Fail for operator and right-hand side of multiary expression
          this.FailRule(ruleId);

          return null;
        }

        expr = this.SucceedRule(ruleId, multiaryExpr) as ParsedExpression;
      } else {
        this.FailRule(ruleId);
        break;
      }
    }

    this.Whitespace();

    return expr;
  }

  protected ExpressionUnary(): ParsedExpression {
    // Divert target is a special case - it can't have any other operators
    // applied to it, and we also want to check for it first so that we don't
    // confuse "->" for subtraction.
    const divertTarget = this.ParseRule(this.ExpressionDivertTarget);
    if (divertTarget != null) {
      return divertTarget;
    }

    let prefixOp = this.OneOf(this.String("-"), this.String("!")) as string;

    // Don't parse like the string rules above, in case its actually
    // a variable that simply starts with "not", e.g. "notable".
    // This rule uses the Identifier rule, which will scan as much text
    // as possible before returning.
    if (prefixOp == null) {
      prefixOp = this.ParseRule(this.ExpressionNot);
    }

    this.Whitespace();

    // - Since we allow numbers at the start of variable names, variable names are checked before literals
    // - Function calls before variable names in case we see parentheses
    let expr = this.OneOf(
      this.ExpressionList,
      this.ExpressionParen,
      this.ExpressionFunctionCall,
      this.ExpressionVariableName,
      this.ExpressionLiteral
    ) as ParsedExpression;

    // Only recurse immediately if we have one of the (usually optional) unary ops
    if (expr == null && prefixOp != null) {
      expr = this.ExpressionUnary();
    }

    if (expr == null) return null;

    if (prefixOp != null) {
      expr = ParsedUnaryExpression.WithInner(expr, prefixOp);
    }

    this.Whitespace();

    const postfixOp = this.OneOf(this.String("++"), this.String("--"));
    if (postfixOp != null) {
      const isInc = postfixOp === "++";

      if (!(expr instanceof ParsedVariableReference)) {
        this.Error(
          `can only increment and decrement variables, but saw '${expr}'`
        );

        // Drop down and succeed without the increment after reporting error
      } else {
        // TODO: Language Server - (Identifier combined into one vs. list of Identifiers)
        const varRef = expr;
        expr = new ParsedIncDecExpression(varRef.identifier, isInc);
      }
    }

    return expr;
  }

  protected ExpressionNot(): string {
    const id = this.Identifier();
    if (id === "not") {
      return id;
    }

    return null;
  }

  protected ExpressionLiteral(): ParsedExpression {
    return this.OneOf(
      this.ExpressionFloat,
      this.ExpressionInt,
      this.ExpressionBool,
      this.ExpressionString
    ) as ParsedExpression;
  }

  protected ExpressionDivertTarget(): ParsedExpression {
    this.Whitespace();

    const divert = this.ParseRule(this.SingleDivert);
    if (divert == null) return null;

    if (divert.isThread) return null;

    this.Whitespace();

    return new ParsedDivertTarget(divert);
  }

  protected ExpressionInt(): ParsedNumber {
    const intOrNull = this.ParseInt();
    if (intOrNull == null) {
      return null;
    }
    return new ParsedNumber(intOrNull);
  }

  protected ExpressionFloat(): ParsedNumber {
    const floatOrNull = this.ParseFloat();
    if (floatOrNull == null) {
      return null;
    }
    return new ParsedNumber(floatOrNull);
  }

  protected ExpressionString(): ParsedStringExpression {
    const openQuote = this.ParseString('"');
    if (openQuote == null) {
      return null;
    }

    // Set custom parser state flag so that within the text parser,
    // it knows to treat the quote character (") as an end character
    this.parsingStringExpression = true;

    let textAndLogic = this.ParseRule<ParsedObject[]>(this.MixedTextAndLogic);

    this.Expect(this.String('"'), "close quote for string expression");

    this.parsingStringExpression = false;

    if (textAndLogic == null) {
      textAndLogic = [];
      textAndLogic.push(new ParsedText(""));
    } else if (textAndLogic.find((c) => c instanceof ParsedDivert)) {
      this.Error("String expressions cannot contain diverts (->)");
    }

    return new ParsedStringExpression(textAndLogic);
  }

  protected ExpressionBool(): ParsedNumber {
    const id = this.ParseRule(this.Identifier);
    if (id === "true") {
      return new ParsedNumber(true);
    }
    if (id === "false") {
      return new ParsedNumber(false);
    }

    return null;
  }

  protected ExpressionFunctionCall(): ParsedExpression {
    const iden = this.ParseRule<Identifier>(this.IdentifierWithMetadata);
    if (iden == null) {
      return null;
    }

    this.Whitespace();

    const args = this.ParseRule<ParsedExpression[]>(
      this.ExpressionFunctionCallArguments
    );
    if (args == null) {
      return null;
    }

    return new ParsedFunctionCall(iden, args);
  }

  protected ExpressionFunctionCallArguments(): ParsedExpression[] {
    if (this.ParseString("(") == null) {
      return null;
    }

    // "Exclude" requires the rule to succeed, but causes actual comma string to be excluded from the list of results
    const commas = this.Exclude(this.String(","));
    let args = this.Interleave<ParsedExpression>(this.Expression, commas);
    if (args == null) {
      args = [];
    }

    this.Whitespace();

    this.Expect(this.String(")"), "closing ')' for function call");

    return args;
  }

  protected ExpressionVariableName(): ParsedExpression {
    const path = this.Interleave<Identifier>(
      this.IdentifierWithMetadata,
      this.Exclude(this.Spaced(this.String(".")))
    );

    if (path == null || ParsedStory.IsReservedKeyword(path[0].name))
      return null;

    return new ParsedVariableReference(path);
  }

  protected ExpressionParen(): ParsedExpression {
    if (this.ParseString("(") == null) {
      return null;
    }

    const innerExpr = this.ParseRule(this.Expression);
    if (innerExpr == null) return null;

    this.Whitespace();

    this.Expect(this.String(")"), "closing parenthesis ')' for expression");

    return innerExpr;
  }

  protected ExpressionInfixRight(
    left: ParsedExpression,
    op: InfixOperator
  ): ParsedExpression {
    this.Whitespace();

    const right = this.ParseRule<ParsedExpression>(
      (): ParsedExpression => this.Expression(op.precedence)
    );
    if (right) {
      // We assume that the character we use for the operator's type is the same
      // as that used internally by e.g. Runtime.Expression.Add, Runtime.Expression.Multiply etc
      const expr = new ParsedBinaryExpression(left, right, op.type);
      return expr;
    }

    return null;
  }

  private ParseInfixOperator(): InfixOperator {
    for (let i = 0; i < this._binaryOperators.length; i += 1) {
      const op = this._binaryOperators[i];

      const ruleId = this.BeginRule();

      let skipFail = false;
      if (this.ParseString(op.type) != null) {
        if (op.requireWhitespace && this.Whitespace() == null) {
          this.FailRule(ruleId);
          skipFail = true;
        } else {
          return this.SucceedRule(ruleId, op) as InfixOperator;
        }
      }

      if (!skipFail) {
        this.FailRule(ruleId);
      }
    }

    return null;
  }

  protected ExpressionList(): ParsedList {
    this.Whitespace();

    if (this.ParseString("(") == null) {
      return null;
    }

    this.Whitespace();

    // When list has:
    //  - 0 elements (null list) - this is okay, it's an empty list: "()"
    //  - 1 element - it could be confused for a single non-list related
    //    identifier expression in brackets, but this is a useless thing
    //    to do, so we reserve that syntax for a list with one item.
    //  - 2 or more elements - normal!
    const memberNames = this.SeparatedList(
      this.ListMember,
      this.Spaced(this.String(","))
    );

    this.Whitespace();

    // May have failed to parse the inner list - the parentheses may
    // be for a normal expression
    if (this.ParseString(")") == null) {
      return null;
    }

    return new ParsedList(memberNames);
  }

  protected ListMember(): Identifier {
    this.Whitespace();

    const identifier = this.ParseRule<Identifier>(this.IdentifierWithMetadata);
    if (identifier == null) return null;

    const dot = this.ParseString(".");
    if (dot != null) {
      const identifier2 = this.Expect(
        this.IdentifierWithMetadata,
        `element name within the set ${identifier}`
      ) as Identifier;
      identifier.name = `${identifier.name}.${identifier2?.name}`;
    }

    this.Whitespace();

    return identifier;
  }

  private RegisterExpressionOperators(): void {
    this._maxBinaryOpLength = 0;
    this._binaryOperators = [];

    // These will be tried in order, so we need "<=" before "<"
    // for correctness

    this.RegisterBinaryOperator("&&", 1);
    this.RegisterBinaryOperator("||", 1);
    this.RegisterBinaryOperator("and", 1, true);
    this.RegisterBinaryOperator("or", 1, true);

    this.RegisterBinaryOperator("==", 2);
    this.RegisterBinaryOperator(">=", 2);
    this.RegisterBinaryOperator("<=", 2);
    this.RegisterBinaryOperator("<", 2);
    this.RegisterBinaryOperator(">", 2);
    this.RegisterBinaryOperator("!=", 2);

    // (apples, oranges) + cabbages has (oranges, cabbages) == true
    this.RegisterBinaryOperator("?", 3);
    this.RegisterBinaryOperator("has", 3, true);
    this.RegisterBinaryOperator("!?", 3);
    this.RegisterBinaryOperator("hasnt", 3, true);
    this.RegisterBinaryOperator("^", 3);

    this.RegisterBinaryOperator("+", 4);
    this.RegisterBinaryOperator("-", 5);
    this.RegisterBinaryOperator("*", 6);
    this.RegisterBinaryOperator("/", 7);

    this.RegisterBinaryOperator("%", 8);
    this.RegisterBinaryOperator("mod", 8, true);
  }

  RegisterBinaryOperator(
    op: string,
    precedence: number,
    requireWhitespace = false
  ): void {
    this._binaryOperators.push(
      new InfixOperator(op, precedence, requireWhitespace)
    );
    this._maxBinaryOpLength = Math.max(this._maxBinaryOpLength, op.length);
  }

  protected KnotDefinition(): ParsedKnot {
    const knotDecl = this.ParseRule(this.KnotDeclaration);
    if (knotDecl == null) return null;

    this.Expect(
      this.EndOfLine,
      "end of line after knot name definition",
      this.SkipToNextLine
    );

    const innerKnotStatements = (): ParsedObject[] =>
      this.StatementsAtLevel(StatementLevel.Knot);

    const content = this.Expect(
      innerKnotStatements,
      "at least one line within the knot",
      this.KnotStitchNoContentRecoveryRule
    ) as ParsedObject[];

    return new ParsedKnot(
      knotDecl.name,
      content,
      knotDecl.arguments,
      knotDecl.isFunction
    );
  }

  protected KnotDeclaration(): FlowDecl {
    this.Whitespace();

    if (this.KnotTitleEquals() == null) {
      return null;
    }

    this.Whitespace();

    const identifier = this.ParseRule(this.IdentifierWithMetadata);
    let knotName: Identifier;

    const isFunc = identifier?.name === "function";
    if (isFunc) {
      this.Expect(this.Whitespace, "whitespace after the 'function' keyword");
      knotName = this.ParseRule(this.IdentifierWithMetadata);
    } else {
      knotName = identifier;
    }

    if (knotName == null) {
      this.Error(`Expected the name of the ${isFunc ? "function" : "knot"}`);
      knotName = { name: "", debugMetadata: null }; // prevent later null ref
    }

    this.Whitespace();

    const parameterNames = this.ParseRule(this.BracketedKnotDeclArguments);

    this.Whitespace();

    // Optional equals after name
    this.ParseRule(this.KnotTitleEquals);

    return { name: knotName, arguments: parameterNames, isFunction: isFunc };
  }

  protected KnotTitleEquals(): string {
    // 2+ "=" starts a knot
    const multiEquals = this.ParseCharactersFromString("=");
    if (multiEquals == null || multiEquals.length <= 1) {
      return null;
    }
    return multiEquals;
  }

  protected StitchDefinition(): ParsedStitch {
    const decl = this.ParseRule(this.StitchDeclaration);
    if (decl == null) {
      return null;
    }

    this.Expect(
      this.EndOfLine,
      "end of line after stitch name",
      this.SkipToNextLine
    );

    const innerStitchStatements = (): ParsedObject[] =>
      this.StatementsAtLevel(StatementLevel.Stitch);

    const content = this.Expect(
      innerStitchStatements,
      "at least one line within the stitch",
      this.KnotStitchNoContentRecoveryRule
    ) as ParsedObject[];

    return new ParsedStitch(
      decl.name,
      content,
      decl.arguments,
      decl.isFunction
    );
  }

  protected StitchDeclaration(): FlowDecl {
    this.Whitespace();

    // Single "=" to define a stitch
    if (this.ParseString("=") == null) return null;

    // If there's more than one "=", that's actually a knot definition (or divert), so this rule should fail
    if (this.ParseString("=") != null) return null;

    this.Whitespace();

    // Stitches aren't allowed to be functions, but we parse it anyway and report the error later
    const isFunc = this.ParseString("function") != null;
    if (isFunc) {
      this.Whitespace();
    }

    const stitchName = this.ParseRule(this.IdentifierWithMetadata);
    if (stitchName == null) {
      return null;
    }

    this.Whitespace();

    const flowArgs = this.ParseRule<Argument[]>(
      this.BracketedKnotDeclArguments
    );

    this.Whitespace();

    return { name: stitchName, arguments: flowArgs, isFunction: isFunc };
  }

  protected KnotStitchNoContentRecoveryRule(): ParsedObject[] {
    // Jump ahead to the next knot or the end of the file
    this.ParseUntil(this.KnotDeclaration, new CharacterSet("="), null);

    const recoveredFlowContent: ParsedObject[] = [];
    recoveredFlowContent.push(new ParsedText("<ERROR IN FLOW>"));
    return recoveredFlowContent;
  }

  protected BracketedKnotDeclArguments(): Argument[] {
    if (this.ParseString("(") == null) {
      return null;
    }

    let flowArguments = this.Interleave<Argument>(
      this.Spaced(this.FlowDeclArgument),
      this.Exclude(this.String(","))
    );

    this.Expect(this.String(")"), "closing ')' for parameter list");

    // If no parameters, create an empty list so that this method is type safe and
    // doesn't attempt to return the ParseSuccess object
    if (flowArguments == null) {
      flowArguments = [];
    }

    return flowArguments;
  }

  protected FlowDeclArgument(): Argument {
    // Possible forms:
    //  name
    //  -> name      (variable divert target argument
    //  ref name
    //  ref -> name  (variable divert target by reference)
    const firstIden = this.ParseRule(this.IdentifierWithMetadata);
    this.Whitespace();
    const divertArrow = this.ParseDivertArrow();
    this.Whitespace();
    const secondIden = this.ParseRule(this.IdentifierWithMetadata);

    if (firstIden == null && secondIden == null) {
      return null;
    }

    const flowArg = {
      isByReference: false,
      isDivertTarget: false,
      identifier: null,
    };
    if (divertArrow != null) {
      flowArg.isDivertTarget = true;
    }

    // Passing by reference
    if (firstIden != null && firstIden.name === "ref") {
      if (secondIden == null) {
        this.Error("Expected an parameter name after 'ref'");
      }

      flowArg.identifier = secondIden;
      flowArg.isByReference = true;
    }

    // Simple argument name
    else {
      if (flowArg.isDivertTarget) {
        flowArg.identifier = secondIden;
      } else {
        flowArg.identifier = firstIden;
      }

      if (flowArg.identifier == null) {
        this.Error("Expected an parameter name");
      }

      flowArg.isByReference = false;
    }

    return flowArg;
  }

  protected ExternalDeclaration(): ParsedExternalDeclaration {
    this.Whitespace();

    const external = this.ParseRule(this.IdentifierWithMetadata);
    if (external == null || external.name !== "EXTERNAL") {
      return null;
    }

    this.Whitespace();

    const funcIdentifier = (this.Expect(
      this.IdentifierWithMetadata,
      "name of external function"
    ) as Identifier) || { name: null, debugMetadata: null };

    this.Whitespace();

    let parameterNames = this.Expect(
      this.BracketedKnotDeclArguments,
      `declaration of arguments for EXTERNAL, even if empty, i.e. 'EXTERNAL ${funcIdentifier}()'`
    ) as Argument[];
    if (parameterNames == null) {
      parameterNames = [];
    }

    const argNames = parameterNames.map((arg) => arg.identifier?.name);

    return new ParsedExternalDeclaration(funcIdentifier, argNames);
  }

  protected LogicLine(): ParsedObject {
    this.Whitespace();

    if (this.ParseString("~") == null) {
      return null;
    }

    this.Whitespace();

    // Some example lines we need to be able to distinguish between:
    // ~ temp x = 5  -- var decl + assign
    // ~ temp x      -- var decl
    // ~ x = 5       -- var assign
    // ~ x           -- expr (not var decl or assign)
    // ~ f()         -- expr
    // We don't treat variable decl/assign as an expression since we don't want an assignment
    // to have a return value, or to be used in compound expressions.
    const afterTilda = (): unknown =>
      this.OneOf(
        this.ReturnStatement,
        this.TempDeclarationOrAssignment,
        this.Expression
      );

    let result = this.Expect(
      afterTilda,
      "expression after '~'",
      this.SkipToNextLine
    ) as ParsedObject;

    // Prevent further errors, already reported expected expression and have skipped to next line.
    if (result == null) {
      return new ParsedContentList();
    }

    // Parse all expressions, but tell the writer off if they did something useless like:
    //  ~ 5 + 4
    // And even:
    //  ~ false && myFunction()
    // ...since it's bad practice, and won't do what they expect if
    // they're expecting C's lazy evaluation.
    if (
      result instanceof ParsedExpression &&
      !(
        result instanceof ParsedFunctionCall ||
        result instanceof ParsedIncDecExpression
      )
    ) {
      // TODO: Remove this specific error message when it has expired in usefulness
      const varRef = result as ParsedVariableReference;
      if (varRef && varRef.name === "include") {
        this.Error(
          "'~ include' is no longer the correct syntax - please use 'INCLUDE your_filename.ink', without the tilda, and in block capitals."
        );
      } else {
        this.Error(
          "Logic following a '~' can't be that type of expression. It can only be something like:\n\t~ return\n\t~ var x = blah\n\t~ x++\n\t~ myFunction()"
        );
      }
    }

    // Line is pure function call? e.g.
    //  ~ f()
    // Add extra pop to make sure we tidy up after ourselves.
    // We no longer need anything on the evaluation stack.
    const funCall = result as ParsedFunctionCall;
    if (funCall) {
      funCall.shouldPopReturnedValue = true;
    }

    // If the expression contains a function call, then it could produce a text side effect,
    // in which case it needs a newline on the end. e.g.
    //  ~ printMyName()
    //  ~ x = 1 + returnAValueAndAlsoPrintStuff()
    // If no text gets printed, then the extra newline will have to be culled later.
    // Multiple newlines on the output will be removed, so there will be no "leak" for
    // long running calculations. It's disappointingly messy though :-/
    if (result.Find<ParsedFunctionCall>() != null) {
      result = new ParsedContentList(result, new ParsedText("\n"));
    }

    this.Expect(this.EndOfLine, "end of line", this.SkipToNextLine);

    return result as ParsedObject;
  }

  protected VariableDeclaration(): ParsedObject {
    this.Whitespace();

    const id = this.ParseRule(this.Identifier);
    if (id !== "VAR") {
      return null;
    }

    this.Whitespace();

    const varName = this.Expect(
      this.IdentifierWithMetadata,
      "variable name"
    ) as Identifier;

    this.Whitespace();

    this.Expect(
      this.String("="),
      "the '=' for an assignment of a value, e.g. '= 5' (initial values are mandatory)"
    );

    this.Whitespace();

    const definition = this.Expect(this.Expression, "initial value for ");

    const expr = definition as ParsedExpression;

    if (expr) {
      if (
        !(
          expr instanceof ParsedNumber ||
          expr instanceof ParsedStringExpression ||
          expr instanceof ParsedDivertTarget ||
          expr instanceof ParsedVariableReference ||
          expr instanceof ParsedList
        )
      ) {
        this.Error(
          "initial value for a variable must be a number, constant, list or divert target"
        );
      }

      if (this.ParseRule(this.ListElementDefinitionSeparator) != null) {
        this.Error(
          "Unexpected ','. If you're trying to declare a new list, use the LIST keyword, not VAR"
        );
      }

      // Ensure string expressions are simple
      else if (expr instanceof ParsedStringExpression) {
        const strExpr = expr as ParsedStringExpression;
        if (!strExpr.isSingleString) {
          this.Error("Constant strings cannot contain any logic.");
        }
      }

      const result = new ParsedVariableAssignment(varName, expr);
      result.isGlobalDeclaration = true;
      return result;
    }

    return null;
  }

  protected ListDeclaration(): ParsedVariableAssignment {
    this.Whitespace();

    const id = this.ParseRule(this.Identifier);
    if (id !== "LIST") {
      return null;
    }

    this.Whitespace();

    const varName = this.Expect(
      this.IdentifierWithMetadata,
      "list name"
    ) as Identifier;

    this.Whitespace();

    this.Expect(
      this.String("="),
      "the '=' for an assignment of the list definition"
    );

    this.Whitespace();

    const definition = this.Expect(
      this.ListDefinition,
      "list item names"
    ) as ParsedListDefinition;

    if (definition) {
      definition.identifier = varName;

      return new ParsedVariableAssignment(varName, null, definition);
    }

    return null;
  }

  protected ListDefinition(): ParsedListDefinition {
    this.AnyWhitespace();

    const allElements = this.SeparatedList(
      this.ListElementDefinition,
      this.ListElementDefinitionSeparator
    );
    if (allElements == null) {
      return null;
    }

    return new ParsedListDefinition(allElements);
  }

  protected ListElementDefinitionSeparator(): string {
    this.AnyWhitespace();

    if (this.ParseString(",") == null) {
      return null;
    }

    this.AnyWhitespace();

    return ",";
  }

  protected ListElementDefinition(): ParsedListElementDefinition {
    const inInitialList = this.ParseString("(") != null;
    let needsToCloseParen = inInitialList;

    this.Whitespace();

    const name = this.ParseRule(this.IdentifierWithMetadata);
    if (name == null) {
      return null;
    }

    this.Whitespace();

    if (inInitialList) {
      if (this.ParseString(")") != null) {
        needsToCloseParen = false;
        this.Whitespace();
      }
    }

    let elementValue = null;
    if (this.ParseString("=") != null) {
      this.Whitespace();

      const elementValueNum = this.Expect(
        this.ExpressionInt,
        "value to be assigned to list item"
      ) as ParsedNumber;
      if (elementValueNum != null) {
        elementValue = elementValueNum.value;
      }

      if (needsToCloseParen) {
        this.Whitespace();

        if (this.ParseString(")") != null) needsToCloseParen = false;
      }
    }

    if (needsToCloseParen) {
      this.Error("Expected closing ')'");
    }

    return new ParsedListElementDefinition(name, inInitialList, elementValue);
  }

  protected ConstDeclaration(): ParsedObject {
    this.Whitespace();

    const id = this.ParseRule(this.Identifier);
    if (id !== "CONST") {
      return null;
    }

    this.Whitespace();

    const varName = this.Expect(
      this.IdentifierWithMetadata,
      "constant name"
    ) as Identifier;

    this.Whitespace();

    this.Expect(
      this.String("="),
      "the '=' for an assignment of a value, e.g. '= 5' (initial values are mandatory)"
    );

    this.Whitespace();

    const expr = this.Expect(
      this.Expression,
      "initial value for "
    ) as ParsedExpression;
    if (
      !(
        expr instanceof ParsedNumber ||
        expr instanceof ParsedDivertTarget ||
        expr instanceof ParsedStringExpression
      )
    ) {
      this.Error(
        "initial value for a constant must be a number or divert target"
      );
    }

    // Ensure string expressions are simple
    else if (expr instanceof ParsedStringExpression) {
      const strExpr = expr as ParsedStringExpression;
      if (!strExpr.isSingleString) {
        this.Error("Constant strings cannot contain any logic.");
      }
    }

    const result = new ParsedConstantDeclaration(varName, expr);
    return result;
  }

  protected InlineLogicOrGlue(): ParsedObject {
    return this.OneOf(this.InlineLogic, this.Glue) as ParsedObject;
  }

  protected Glue(): ParsedGlue {
    // Don't want to parse whitespace, since it might be important
    // surrounding the glue.
    const glueStr = this.ParseString("<>");
    if (glueStr != null) {
      return new ParsedGlue(new Glue());
    }
    return null;
  }

  protected InlineLogic(): ParsedObject {
    if (this.ParseString("{") == null) {
      return null;
    }

    this.Whitespace();

    const logic = this.Expect(
      this.InnerLogic,
      "some kind of logic, conditional or sequence within braces: { ... }"
    ) as ParsedObject;
    if (logic == null) return null;

    this.DisallowIncrement(logic);

    let contentList = logic as ParsedContentList;
    if (!contentList) {
      contentList = new ParsedContentList(logic);
    }

    this.Whitespace();

    this.Expect(this.String("}"), "closing brace '}' for inline logic");

    return contentList;
  }

  protected InnerLogic(): ParsedObject {
    this.Whitespace();

    // Explicitly try the combinations of inner logic
    // that could potentially have conflicts first.

    // Explicit sequence annotation?
    const explicitSeqType = this.ParseObject(
      this.SequenceTypeAnnotation
    ) as SequenceType;
    if (explicitSeqType != null) {
      const contentLists = this.Expect(
        this.InnerSequenceObjects,
        "sequence elements (for cycle/stoping etc)"
      ) as ParsedContentList[];
      if (contentLists == null) {
        return null;
      }
      return new ParsedSequence(contentLists, explicitSeqType);
    }

    // Conditional with expression?
    const initialQueryExpression = this.ParseRule(this.ConditionExpression);
    if (initialQueryExpression) {
      const conditional = this.Expect(
        () => this.InnerConditionalContent(initialQueryExpression),
        "conditional content following query"
      ) as ParsedObject;
      return conditional;
    }

    // Now try to evaluate each of the "full" rules in turn
    const rules: ParseRule[] = [
      // Conditional still necessary, since you can have a multi-line conditional
      // without an initial query expression:
      // {
      //   - true:  this is true
      //   - false: this is false
      // }
      this.InnerConditionalContent,
      this.InnerSequence,
      this.InnerExpression,
    ];

    // Adapted from "OneOf" structuring rule except that in
    // order for the rule to succeed, it has to maximally
    // cover the entire string within the { }. Used to
    // differentiate between:
    //  {myVar}                 -- Expression (try first)
    //  {my content is jolly}   -- sequence with single element
    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i];
      const ruleId = this.BeginRule();

      const result = this.ParseObject(rule) as ParsedObject;
      if (result) {
        // Not yet at end?
        if (this.Peek(this.Spaced(this.String("}"))) == null) {
          this.FailRule(ruleId);
        }

        // Full parse of content within braces
        else {
          return this.SucceedRule(ruleId, result) as ParsedObject;
        }
      } else {
        return this.FailRule(ruleId) as ParsedObject;
      }
    }

    return null;
  }

  protected InnerExpression(): ParsedObject {
    const expr = this.ParseRule(this.Expression);
    if (expr) {
      expr.outputWhenComplete = true;
    }
    return expr;
  }

  protected IdentifierWithMetadata(): Identifier {
    const id = this.Identifier();
    if (id == null) {
      return null;
    }

    // InkParser.RuleDidSucceed will add DebugMetadata
    return { name: id, debugMetadata: null };
  }

  // Note: we allow identifiers that start with a number,
  // but not if they *only* comprise numbers
  protected Identifier(): string {
    // Parse remaining characters (if any)
    const name = this.ParseCharactersFromCharSet(this.identifierCharSet);
    if (name == null) {
      return null;
    }

    // Reject if it's just a number
    let isNumberCharsOnly = true;
    for (let i = 0; i < name.length; i += 1) {
      const c = name[i];
      if (!(c >= "0" && c <= "9")) {
        isNumberCharsOnly = false;
        break;
      }
    }
    if (isNumberCharsOnly) {
      return null;
    }

    return name;
  }

  protected InnerSequence(): ParsedSequence {
    this.Whitespace();

    // Default sequence type
    let seqType = SequenceType.Stopping;

    // Optional explicit sequence type
    const parsedSeqType = this.ParseRule(this.SequenceTypeAnnotation);
    if (parsedSeqType != null) {
      seqType = parsedSeqType as SequenceType;
    }

    const contentLists = this.ParseRule(this.InnerSequenceObjects);
    if (contentLists == null || contentLists.length <= 1) {
      return null;
    }

    return new ParsedSequence(contentLists, seqType);
  }

  protected SequenceTypeAnnotation(): unknown {
    let annotation = this.ParseRule(this.SequenceTypeSymbolAnnotation);

    if (annotation == null) {
      annotation = this.ParseRule<SequenceType>(
        this.SequenceTypeWordAnnotation
      );
    }

    if (annotation == null) {
      return null;
    }

    switch (annotation) {
      case SequenceType.Once:
      case SequenceType.Cycle:
      case SequenceType.Stopping:
      case SequenceType.Shuffle:
      case SequenceType.Shuffle | SequenceType.Stopping:
      case SequenceType.Shuffle | SequenceType.Once:
        break;

      default:
        this.Error(`Sequence type combination not supported: ${annotation}`);
        return SequenceType.Stopping;
    }

    return annotation;
  }

  protected SequenceTypeSymbolAnnotation(): SequenceType {
    if (this._sequenceTypeSymbols == null) {
      this._sequenceTypeSymbols = new CharacterSet("!&~$ ");
    }

    let sequenceType = null;
    const sequenceAnnotations = this.ParseCharactersFromCharSet(
      this._sequenceTypeSymbols
    );
    if (sequenceAnnotations == null) {
      return null;
    }

    for (let i = 0; i < sequenceAnnotations.length; i += 1) {
      const symbolChar = sequenceAnnotations[i];
      switch (symbolChar) {
        case "!":
          sequenceType |= SequenceType.Once;
          break;
        case "&":
          sequenceType |= SequenceType.Cycle;
          break;
        case "~":
          sequenceType |= SequenceType.Shuffle;
          break;
        case "$":
          sequenceType |= SequenceType.Stopping;
          break;
        default:
          break;
      }
    }

    if (sequenceType == null) {
      return null;
    }

    return sequenceType;
  }

  protected SequenceTypeWordAnnotation(): SequenceType {
    const sequenceTypes = this.Interleave<SequenceType>(
      this.SequenceTypeSingleWord,
      this.Exclude(this.Whitespace)
    );
    if (sequenceTypes == null || sequenceTypes.length === 0) {
      return null;
    }

    if (this.ParseString(":") == null) {
      return null;
    }

    let combinedSequenceType = null;
    sequenceTypes.forEach((seqType) => {
      combinedSequenceType |= seqType;
    });

    return combinedSequenceType;
  }

  protected SequenceTypeSingleWord(): unknown {
    let seqType = null;

    const word = this.ParseRule(this.IdentifierWithMetadata);
    if (word != null) {
      switch (word.name) {
        case "once":
          seqType = SequenceType.Once;
          break;
        case "cycle":
          seqType = SequenceType.Cycle;
          break;
        case "shuffle":
          seqType = SequenceType.Shuffle;
          break;
        case "stopping":
          seqType = SequenceType.Stopping;
          break;
        default:
          break;
      }
    }

    if (seqType == null) return null;

    return seqType;
  }

  protected InnerSequenceObjects(): ParsedContentList[] {
    const multiline = this.ParseRule(this.Newline) != null;

    let result: ParsedContentList[] = null;
    if (multiline) {
      result = this.ParseRule(this.InnerMultilineSequenceObjects);
    } else {
      result = this.ParseRule(this.InnerInlineSequenceObjects);
    }

    return result;
  }

  protected InnerInlineSequenceObjects(): ParsedContentList[] {
    const interleavedContentAndPipes = this.Interleave<ParsedObject | "|">(
      this.Optional(this.MixedTextAndLogic),
      this.String("|"),
      null,
      false
    );
    if (interleavedContentAndPipes == null) return null;

    const result: ParsedContentList[] = [];

    // The content and pipes won't necessarily be perfectly interleaved in the sense that
    // the content can be missing, but in that case it's intended that there's blank content.
    let justHadContent = false;
    interleavedContentAndPipes.forEach((contentOrPipe) => {
      // Pipe/separator
      if (contentOrPipe === "|") {
        // Expected content, saw pipe - need blank content now
        if (!justHadContent) {
          // Add blank content
          result.push(new ParsedContentList());
        }

        justHadContent = false;
      }

      // Real content
      else {
        const content = contentOrPipe;
        if (content == null) {
          this.Error(
            `Expected content, but got ${contentOrPipe} (this is an ink compiler bug!)`
          );
        } else {
          result.push(new ParsedContentList(content));
        }

        justHadContent = true;
      }
    });

    // Ended in a pipe? Need to insert final blank content
    if (!justHadContent) result.push(new ParsedContentList());

    return result;
  }

  protected InnerMultilineSequenceObjects(): ParsedContentList[] {
    this.MultilineWhitespace();

    const contentLists = this.OneOrMore(this.SingleMultilineSequenceElement);
    if (contentLists == null) {
      return null;
    }

    return contentLists as ParsedContentList[];
  }

  protected SingleMultilineSequenceElement(): ParsedContentList {
    this.Whitespace();

    // Make sure we're not accidentally parsing a divert
    if (this.ParseString("->") != null) {
      return null;
    }

    if (this.ParseString("-") == null) {
      return null;
    }

    this.Whitespace();

    const content: ParsedObject[] = this.StatementsAtLevel(
      StatementLevel.InnerBlock
    );

    if (content == null) this.MultilineWhitespace();
    // Add newline at the start of each branch
    else {
      content.splice(0, 0, new ParsedText("\n"));
    }

    return new ParsedContentList(...content);
  }

  protected StatementsAtLevel(level: StatementLevel): ParsedObject[] {
    // Check for error: Should not be allowed gather dashes within an inner block
    if (level === StatementLevel.InnerBlock) {
      const badGatherDashCount = this.ParseRule(this.GatherDashes);
      if (badGatherDashCount != null) {
        this.Error(
          "You can't use a gather (the dashes) within the { curly braces } context. For multi-line sequences and conditions, you should only use one dash."
        );
      }
    }

    return this.Interleave<ParsedObject>(
      this.Optional(this.MultilineWhitespace),
      () => this.StatementAtLevel(level),
      () => this.StatementsBreakForLevel(level)
    );
  }

  protected StatementAtLevel(level: StatementLevel): unknown {
    const rulesAtLevel: ParseRule[] = this._statementRulesAtLevel[level];

    const statement = this.OneOf(...rulesAtLevel);

    // For some statements, allow them to parse, but create errors, since
    // writers may think they can use the statement, so it's useful to have
    // the error message.
    if (level === StatementLevel.Top) {
      if (statement instanceof ParsedReturn) {
        this.Error("should not have return statement outside of a knot");
      }
    }

    return statement;
  }

  protected StatementsBreakForLevel(level: StatementLevel): unknown {
    this.Whitespace();

    const breakRules = this._statementBreakRulesAtLevel[level];

    const breakRuleResult = this.OneOf(...breakRules);
    if (breakRuleResult == null) {
      return null;
    }

    return breakRuleResult;
  }

  private GenerateStatementLevelRules(): void {
    const levels = Object.values(StatementLevel);

    this._statementRulesAtLevel = [];
    this._statementBreakRulesAtLevel = [];
    for (let i = 0; i < levels.length; i += 1) {
      this._statementRulesAtLevel.push([]);
      this._statementBreakRulesAtLevel.push([]);
    }

    levels.forEach((level) => {
      const rulesAtLevel: ParseRule[] = [];
      const breakingRules: ParseRule[] = [];

      // Diverts can go anywhere
      rulesAtLevel.push(this.Line(this.MultiDivert));

      // Knots can only be parsed at Top/Global scope
      if (level >= StatementLevel.Top) rulesAtLevel.push(this.KnotDefinition);

      rulesAtLevel.push(this.Line(this.Choice));

      rulesAtLevel.push(this.Line(this.AuthorWarning));

      // Gather lines would be confused with multi-line block separators, like
      // within a multi-line if statement
      if (level > StatementLevel.InnerBlock) {
        rulesAtLevel.push(this.Gather);
      }

      // Stitches (and gathers) can (currently) only go in Knots and top level
      if (level >= StatementLevel.Knot) {
        rulesAtLevel.push(this.StitchDefinition);
      }

      // Global variable declarations can go anywhere
      rulesAtLevel.push(this.Line(this.ListDeclaration));
      rulesAtLevel.push(this.Line(this.VariableDeclaration));
      rulesAtLevel.push(this.Line(this.ConstDeclaration));
      rulesAtLevel.push(this.Line(this.ExternalDeclaration));

      // Normal logic / text can go anywhere
      rulesAtLevel.push(this.LogicLine);
      rulesAtLevel.push(this.LineOfMixedTextAndLogic);

      // --------
      // Breaking rules

      // Break current knot with a new knot
      if (level <= StatementLevel.Knot) {
        breakingRules.push(this.KnotDeclaration);
      }

      // Break current stitch with a new stitch
      if (level <= StatementLevel.Stitch) {
        breakingRules.push(this.StitchDeclaration);
      }

      // Breaking an inner block (like a multi-line condition statement)
      if (level <= StatementLevel.InnerBlock) {
        breakingRules.push(this.ParseDashNotArrow);
        breakingRules.push(this.String("}"));
      }

      this._statementRulesAtLevel[level] = rulesAtLevel;
      this._statementBreakRulesAtLevel[level] = breakingRules;
    });
  }

  protected SkipToNextLine(): unknown {
    this.ParseUntilCharactersFromString("\n\r");
    this.ParseNewline();
    return StringParser.ParseSuccess;
  }

  // Modifier to turn a rule into one that expects a newline on the end.
  // e.g. anywhere you can use "MixedTextAndLogic" as a rule, you can use
  // "Line(MixedTextAndLogic)" to specify that it expects a newline afterwards.
  protected Line(inlineRule: ParseRule): ParseRule {
    return (): unknown => {
      const result = this.ParseObject(inlineRule);
      if (result == null) {
        return null;
      }

      this.Expect(this.EndOfLine, "end of line", this.SkipToNextLine);

      return result;
    };
  }

  protected Tag(): ParsedTag {
    this.Whitespace();

    if (this.ParseString("#") == null) {
      return null;
    }

    this.Whitespace();

    const sb = new StringBuilder();
    do {
      // Read up to another #, end of input or newline
      const tagText = this.ParseUntilCharactersFromCharSet(
        this._endOfTagCharSet
      );
      sb.Append(tagText);

      // Escape character
      if (this.ParseString("\\") != null) {
        const c = this.ParseSingleCharacter();
        if (c !== String.fromCharCode(0)) {
          sb.Append(c);
        }
      } else {
        break;
      }
    } while (sb);

    const fullTagText = sb.ToString().trim();

    return new ParsedTag(new Tag(fullTagText));
  }

  protected Tags(): ParsedTag[] {
    const tags = this.OneOrMore(this.Tag) as ParsedTag[];
    if (tags == null) {
      return null;
    }

    return tags;
  }

  // Handles both newline and endOfFile
  protected EndOfLine(): unknown {
    return this.OneOf(this.Newline, this.EndOfFile);
  }

  // Allow whitespace before the actual newline
  protected Newline(): unknown {
    this.Whitespace();

    const gotNewline = this.ParseNewline() != null;

    // Optional \r, definite \n to support Windows (\r\n) and Mac/Unix (\n)

    if (!gotNewline) {
      return null;
    }
    return StringParser.ParseSuccess;
  }

  protected EndOfFile(): unknown {
    this.Whitespace();

    if (!this.endOfInput) {
      return null;
    }

    return StringParser.ParseSuccess;
  }

  // General purpose space, returns N-count newlines (fails if no newlines)
  protected MultilineWhitespace(): unknown {
    const newlines = this.OneOrMore(this.Newline);
    if (newlines == null) return null;

    // Use content field of Token to say how many newlines there were
    // (in most circumstances it's unimportant)
    const numNewlines = newlines.length;
    if (numNewlines >= 1) {
      return StringParser.ParseSuccess;
    }
    return null;
  }

  protected Whitespace(): unknown {
    if (this.ParseCharactersFromCharSet(this._inlineWhitespaceChars) != null) {
      return StringParser.ParseSuccess;
    }

    return null;
  }

  protected Spaced(rule: ParseRule): ParseRule {
    return (): unknown => {
      this.Whitespace();

      const result = this.ParseObject(rule);
      if (result == null) {
        return null;
      }

      this.Whitespace();

      return result;
    };
  }

  protected AnyWhitespace(): unknown {
    let anyWhitespace = false;
    while (this.OneOf(this.Whitespace, this.MultilineWhitespace) != null) {
      anyWhitespace = true;
    }
    return anyWhitespace ? StringParser.ParseSuccess : null;
  }

  protected MultiSpaced(rule: ParseRule): ParseRule {
    return (): unknown => {
      this.AnyWhitespace();

      const result = this.ParseObject(rule);
      if (result == null) {
        return null;
      }

      this.AnyWhitespace();

      return result;
    };
  }
}
