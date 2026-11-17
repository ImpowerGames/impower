import { syntaxTree } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import { afterAll, describe, expect, it } from "vitest";
import { screenplayPageLayout } from "../../../sparkdown-screenplay/src/utils/screenplayPageLayout";
import type { ScreenplayConfig } from "../../../sparkdown-screenplay/src/types/ScreenplayConfig";
import type { PageLine } from "../../../sparkdown-screenplay/src/types/DocumentSpan";
import { isHiddenIdentifier } from "../../../sparkdown-screenplay/src/utils/isHiddenIdentifier";
import { SOURCE_COLOR } from "../../../sparkdown-screenplay/src/utils/styleText";
import ScreenplayParser from "../../../sparkdown-screenplay/src/classes/ScreenplayParser";
import { generateScreenplayPrintData } from "../../../sparkdown-screenplay/src/utils/generateScreenplayPrintData";
import createEditorView from "../../src/modules/screenplay-preview/utils/createEditorView";
import { settleParse } from "./parseSettle";
import { extractPdfText } from "./pdfText";

export const KINDS: Record<string, string[]> = {
  AudioLine: ["  ((play music))"],
  BlockAction: ["  :", "    The door creaks."],
  BlockActionInnerBlank: ["  :", "    First.", "", "    Second."],
  BlockActionLeadingBlank: ["  :", "", "    First."],
  BlockDialogue: ["  GUIDE:", "    (softly)", "    Hello there."],
  BlockDialogueInnerBlank: ["  GUIDE:", "    First line.", "", "    Second line."],
  BlockHeading: ["  $:", "    INT. ROOM - DAY"],
  BlockHeadingInnerBlank: ["  $:", "    INT. A", "", "    INT. B"],
  BlockTitle: ["  ^:", "    THE END"],
  BlockTitleInnerBlank: ["  ^:", "    ONE", "    ", "    TWO"],
  BlockTransitional: ["  %:", "    CUT TO:"],
  BlockTransitionalInnerBlank: ["  %:", "    CUT", "", "    TO:"],
  BlockWrite: ["  @ hud:", "    Score up."],
  Branch: ["  branch b", "    Inside.", "  end"],
  Choice: ["  * [Stray.]"],
  ChoiceDivert: ["  * [Onward.] -> s"],
  ImplicitActionDivert: ["  They leave. -> s"],
  InlineDialogueDivert: ["  GUIDE: Bye. -> s"],
  ImplicitActionTag: ["  They go. # mood"],
  ImplicitActionCentredStart: ["  ^Up^ they go."],
  ImplicitActionCentredMiddle: ["  They ^go^ on."],
  ImplicitActionCentredEnd: ["  They go ^on^"],
  ImplicitActionTwoCentred: ["  A ^b^ c ^d^ e."],
  InlineDialogueCentred: ["  GUIDE: Say ^hi^ now."],
  ChoiceCentred: ["  * [Go ^c^ d]"],
  ChoiceTag: ["  * [Go.] # mood"],
  InlineDialogueTag: ["  GUIDE: Hi. # mood"],
  ImplicitActionImageMidLine: ["  They go. [[show bg x]] on."],
  ChoiceLineComment: ["  * [Go.] // note"],
  ImplicitActionGlue: ["  They go <>", "  on."],
  Divert: ["  -> s"],
  DoneStatement: ["  done"],
  DualDialogue: ["  GUIDE <:", "    Left.", "  VISITOR >:", "    Right."],
  FinStatement: ["  fin"],
  ImageAndAudioLine: ["  [[show bg x]] ((play music))"],
  ImageLine: ["  [[show bg x]]"],
  ImplicitAction: ["  The door creaks."],
  Include: ["  include other"],
  InlineAction: ["  : The door creaks."],
  InlineDialogue: ["  GUIDE: Hello."],
  InlineHeading: ["  $: INT. ROOM - DAY"],
  InlineTitle: ["  ^: THE END"],
  InlineTransitional: ["  %: CUT TO:"],
  InlineWrite: ["  @ hud: Score up."],
  LabelAnchor: ["  label here"],
  LuauAnimation: ["  animation spin", "  end"],
  LuauBreakStatement: ["  break"],
  LuauComponent: ["  component card", "  end"],
  LuauContinueStatement: ["  continue"],
  LuauDataTypeDeclaration: ["  type T = number"],
  LuauDefine: ["  define thing", "  end"],
  LuauEndKeyword: ["  end"],
  LuauExternalDeclaration: ["  external outside"],
  LuauFunctionAttributes: ["  @native function g()", "  end"],
  LuauFunctionDefinition: ["  function f()", "    Inner.", "  end"],
  LuauFunctionDefinitionLocal: ["  local function lf()", "  end"],
  LuauFunctionDefinitionOneLine: ["  function f1() end"],
  LuauFunctionDefinitionSharedLine: ["  function f2() end : Same line."],
  LuauFunctionDefinitionThenCommentSharedLine: ["  function f4() end /* c */ : Shared."],
  SparkdownBlockCommentThenFunctionSharedLine: ["  /* c */ function f3() end : Shared."],
  LuauFunctionDefinitionPairSharedLine: ["  function f5() end function f6() end : Shared."],
  LuauFunctionDefinitionPairOnly: ["  function f7() end function f8() end"],
  LuauFunctionDefinitionThenCommentOnly: ["  function f9() end /* c */"],
  SparkdownBlockCommentThenFunctionOnly: ["  /* c */ function f10() end"],
  LuauSparkdownExplicitFunction: ["  & function h()", "  end"],
  LuauFunctionTypeDeclaration: ["  type function tf()", "  end"],
  LuauGotoStatement: ["  goto here"],
  LuauLabel: ["  ::here::"],
  LuauLayout: ["  layout box", "  end"],
  LuauMorph: ["  morph shape", "  end"],
  LuauScreen: ["  screen main", "  end"],
  LuauShebang: ["#!luau"],
  LuauSparkdownChooseBlock: ["  choose", "    * [Go.]", "      They go.", "  end"],
  LuauSparkdownConditionalAlternatorBlock: ["  match x", "    | Small.", "    | Big.", "  end"],
  LuauSparkdownDoBlock: ["  do", "    It snows.", "  end"],
  LuauSparkdownElseBlock: ["  else", "    Yes.", "  end"],
  LuauSparkdownElseifBlock: ["  elseif true then", "    Maybe.", "  end"],
  LuauSparkdownExplicitStatement: ["  & x = 1"],
  LuauSparkdownExplicitStatementBlock: ["  & do", "    local hidden = 8", "  end"],
  LuauSparkdownForLoop: ["  for i = 1, 2 do", "    Again.", "  end"],
  LuauSparkdownIfBlock: ["  if true then", "    It rains.", "  end"],
  LuauSparkdownIfElseBlock: ["  if false then", "    No.", "  else", "    Yes.", "  end"],
  LuauSparkdownReassignment: ["  x = 2"],
  LuauSparkdownRepeatLoop: ["  repeat", "    It drizzles.", "  until true"],
  LuauSparkdownSequentialAlternatorBlock: ["  queue", "    | First time.", "    | Second time.", "  end"],
  CycleAlternatorBlock: ["  cycle", "    | Cycle first.", "    | Cycle second.", "  end"],
  ShuffleAlternatorBlock: ["  shuffle", "    | Shuffle first.", "    | Shuffle second.", "  end"],
  ShuffleCycleAlternatorBlock: ["  shuffle cycle", "    | Mixed first.", "    | Mixed second.", "  end"],
  ChainAlternatorBlock: ["  chain", "    | Chain first.", "    | Chain second.", "  end"],
  PluralAlternatorBlock: ["  plural n", "    | One apple.", "    | Many apples.", "  end"],
  IfElseifBlock: ["  if a then", "    It rains.", "  elseif b then", "    It snows.", "  end"],
  IfElseifElseBlock: ["  if a then", "    It pours.", "  elseif b then", "    It drizzles.", "  else", "    It stops.", "  end"],
  AlternatorDialogueBodies: ["  queue", "    | GUIDE: Hi.", "    | GUIDE (softly): Bye.", "  end"],
  AlternatorChoiceBodies: ["  queue", "    | * [Left.]", "    | * [Right.]", "  end"],
  AlternatorHeadingBodies: ["  queue", "    | $: INT. ATTIC", "    | $: INT. CELLAR", "  end"],
  AlternatorTitleBodies: ["  queue", "    | ^: THE END", "    | ^: THE START", "  end"],
  AlternatorSeveralLineBody: ["  queue", "    | Line one.", "      Line two.", "    | Other line.", "  end"],
  AlternatorBlockActionBody: ["  queue", "    | :", "        Block one.", "        Block two.", "    | Plain arm.", "  end"],
  IfElseDialogueBodies: ["  if a then", "    GUIDE:", "      Yes.", "  else", "    GUIDE:", "      No.", "  end"],
  NestedAlternators: [
    "  queue",
    "    | Outer one.",
    "    | queue",
    "        | Inner one.",
    "        | queue",
    "            | Deep one.",
    "            | Deep two.",
    "          end",
    "      end",
    "  end",
  ],
  AlternatorInsideIf: ["  if a then", "    queue", "      | Inside one.", "      | Inside two.", "    end", "  else", "    Outside.", "  end"],
  IfElseEmptyElse: ["  if a then", "    Only this.", "  else", "  end"],
  IfElseifEmptyBodies: ["  if a then", "  elseif b then", "  else", "  end"],
  IfElseCommandOnlyBody: ["  if a then", "    Printed.", "  else", "    & x = 1", "  end"],
  AlternatorEmptyArm: ["  queue", "    |", "    | Kept arm.", "  end"],
  SingleLineAlternatorThenAction: ["  queue | Alpha. | Beta. end : After them."],
  SingleLineAlternatorThenDialogue: ["  queue | Alpha. | Beta. end GUIDE: After them."],
  MarkupOnlyThenWordsBranch: ["  if a then", "    : <b></b>", "    Real words.", "  end"],
  MarkupOnlyBranch: ["  if a then", "    : <b></b>", "  end"],
  CentredStartBranch: ["  if a then", "    ^Up^ they go.", "  end"],
  CentredMiddleAlternatives: ["  queue", "    | They ^go^ on.", "    | Stay.", "  end"],
  SingleLineConditionalAlternator: ["  match(x) | Small arm | Big arm end"],
  SingleLineBareConditionalAlternator: ["  match x | Small arm | Big arm end"],
  LuauSparkdownSingleLineSequentialAlternatorBlock: ["  queue | Arm one # t | Arm two end"],
  SingleLineCycleAlternator: ["  cycle | Cycle one. | Cycle two. end"],
  SingleLineShuffleAlternator: ["  shuffle | Shuffle one. | Shuffle two. end"],
  SingleLineAlternatorArmDivert: ["  queue | Leave now. -> s | Stay here. end"],
  GluedActionAlternator: ["  They see .. queue | a cat | a dog .. outside."],
  GluedDialogueAlternator: ["  HERO: I want .. queue | tea | coffee .. now."],
  GluedChoiceAlternator: ["  * [Pick .. queue | red | blue ..]"],
  GluedConditionalAlternator: ["  It is .. match(x) | cold | warm .. today."],
  GluedInterpolatedAlternator: ["  They see .. queue | {animal} | a dog .. outside."],
  ImplicitActionInterpolation: ["  Hello {person} there."],
  InlineDialogueInterpolation: ["  GUIDE: Hi {person} again."],
  ChoiceInterpolation: ["  * [Greet {person} warmly.]"],
  SingleLineAlternatorInterpolation: ["  queue | Wave at {person}. | Nod. end"],
  SingleLineAlternatorMarkup: ["  queue | A *bold* arm. | A _plain_ arm. end"],
  NestedSingleLineAlternators: ["  queue | queue | In A. | In B. end | Out. end"],
  GluedMarkupAlternator: ["  They spot .. queue | a *big* owl | a hawk .. above."],
  ImplicitActionMarkupBesideInterpolation: ["  Meet *{person}* and _{guest}_ now."],
  DialogueNameMarkup: ["  *GUIDE*: Hello."],
  InlineDialogueLeadingGlued: ["  GUIDE: .. queue | cat | dog .. outside."],
  InlineDialogueOnlyGlued: ["  GUIDE: .. queue | owl | hawk .."],
  DialogueNameParentheticalMarkup: ["  GUIDE (*V.O.*): Hello."],
  BlockDialogueNameMarkup: ["  GUIDE (_quietly_):", "    Hello there."],
  DialogueNameInterpolation: ["  GUIDE {person}: Hi."],
  ImplicitActionHtml: ["  A <b>bold</b> &amp; \"quoted\" 'single' </script> line."],
  ChoiceHtml: ["  * [Pick <i>this</i> &amp; \"that\" </script>]"],
  InlineDialogueHtml: ["  GUIDE: Say <b>hi</b> &amp; \"bye\" </script>."],
  InlineDialogueHtmlInterpolation: ["  GUIDE: Say {\"<b>hi</b> &amp; </script>\"} now."],
  ImplicitActionMarkup: ["  A *cat* and **dog** and _owl_ \\*star\\*."],
  InlineActionMarkup: ["  : A ***loud*** _low_ line."],
  BlockActionMarkup: ["  :", "    A *soft* \\_escaped\\_ line."],
  InlineHeadingMarkup: ["  $: INT. *ROOM* - DAY"],
  BlockHeadingMarkup: ["  $:", "    INT. _HALL_ - NIGHT"],
  InlineTitleMarkup: ["  ^: THE *END*"],
  BlockTitleMarkup: ["  ^:", "    THE _LAST_ END"],
  InlineTransitionalMarkup: ["  %: *CUT* TO:"],
  BlockTransitionalMarkup: ["  %:", "    _FADE_ OUT."],
  InlineDialogueMarkup: ["  GUIDE: A *cat* \\*here\\*."],
  BlockDialogueMarkup: ["  GUIDE:", "    (*softly*)", "    A _quiet_ word."],
  ChoiceMarkup: ["  * [A *cat ..* tail.]"],
  InlineDialogueCentredMarkup: ["  GUIDE: ^Hello there.^"],
  BlockDialogueThenCentredAction: ["  GUIDE:", "    ^Hello there.^"],
  GluedTwiceOneLine: ["  They see .. queue | a cat | a dog .. and .. queue | a cow | a hen .. now."],
  GluedBesideSameText: ["  They see a } .. queue | a cat | a dog .. } outside."],
  GluedEmptyArm: ["  They see .. queue | | a dog .. outside."],
  GluedTrailingEmptyArm: ["  They see .. queue | a dog | .. outside."],
  GluedConditionalEmptyArm: ["  It is .. match(x) | | warm .. today."],
  GluedOnlyEmptyArms: ["  They see .. queue | | .. outside."],
  GluedConditionalTrailingEmptyArm: ["  It is .. match(x) | cold | .. today."],
  GluedNestedConditionAlternator: ["  It is .. match(cycle | 1 | 2 end) | cold | warm .. today."],
  GluedQuotedBarArm: ["  They see .. queue | {\"a|b\"} | a dog .. outside."],
  GluedQuotedBraceArm: ["  They see .. queue | {\"{a}\"} | a dog .. outside."],
  ChoiceEscape: ["  * [Pick \\*one\\* _now_.]"],
  LuauSparkdownVariableDefinition: ["  local z = 3"],
  LuauSparkdownWhileLoop: ["  while false do", "    It hails.", "  end"],
  LuauStrayUntilStatement: ["  until true"],
  LuauStyle: ["  style bold", "  end"],
  LuauTheme: ["  theme dark", "  end"],
  Newline: [""],
  Run: ["  run other"],
  Scene: ["scene t"],
  SparkdownBlockComment: ["  /* note */"],
  SparkdownLineComment: ["  // note"],
  Tags: ["  # mood"],
  Thread: ["  <- other"],
  TrailingWhitespace: ["  end   "],
  Whitespace: ["    "],
};

export const GLUED_LAYOUTS: Record<string, string[]> = {
  GluedActionAlternator: ["They see {a cat|a dog} outside."],
  GluedDialogueAlternator: ["HERO", "I want {tea|coffee} now."],
  GluedChoiceAlternator: ["* [Pick {red|blue}]"],
  GluedConditionalAlternator: ["It is {cold|warm} today."],
  GluedInterpolatedAlternator: ["They see {{animal}|a dog} outside."],
  GluedMarkupAlternator: ["They spot {a big owl|a hawk} above."],
};

export const ALTERNATIVE_LAYOUTS: Record<string, string[]> = {
  LuauSparkdownSequentialAlternatorBlock: ["{", "| First time.", "| Second time.", "}"],
  LuauSparkdownConditionalAlternatorBlock: ["{", "| Small.", "| Big.", "}"],
  CycleAlternatorBlock: ["{", "| Cycle first.", "| Cycle second.", "}"],
  ShuffleAlternatorBlock: ["{", "| Shuffle first.", "| Shuffle second.", "}"],
  ShuffleCycleAlternatorBlock: ["{", "| Mixed first.", "| Mixed second.", "}"],
  ChainAlternatorBlock: ["{", "| Chain first.", "| Chain second.", "}"],
  PluralAlternatorBlock: ["{", "| One apple.", "| Many apples.", "}"],
  LuauSparkdownIfElseBlock: ["{", "| No.", "| Yes.", "}"],
  IfElseifBlock: ["{", "| It rains.", "| It snows.", "}"],
  IfElseifElseBlock: ["{", "| It pours.", "| It drizzles.", "| It stops.", "}"],
  AlternatorDialogueBodies: ["{", "| GUIDE", "  Hi.", "| GUIDE (softly)", "  Bye.", "}"],
  AlternatorChoiceBodies: ["{", "| * [Left.]", "| * [Right.]", "}"],
  AlternatorHeadingBodies: ["{", "| INT. ATTIC", "| INT. CELLAR", "}"],
  AlternatorTitleBodies: ["{", "| THE END", "| THE START", "}"],
  AlternatorSeveralLineBody: ["{", "| Line one.", "  Line two.", "| Other line.", "}"],
  AlternatorBlockActionBody: ["{", "| Block one.", "  Block two.", "| Plain arm.", "}"],
  IfElseDialogueBodies: ["{", "| GUIDE", "  Yes.", "| GUIDE", "  No.", "}"],
  NestedAlternators: ["{", "| Outer one.", "| {", "  | Inner one.", "  | {", "    | Deep one.", "    | Deep two.", "    }", "  }", "}"],
  AlternatorInsideIf: ["{", "| {", "  | Inside one.", "  | Inside two.", "  }", "| Outside.", "}"],
  SingleLineConditionalAlternator: ["{", "| Small arm", "| Big arm", "}"],
  SingleLineBareConditionalAlternator: ["{", "| Small arm", "| Big arm", "}"],
  LuauSparkdownSingleLineSequentialAlternatorBlock: ["{", "| Arm one", "| Arm two", "}"],
  SingleLineCycleAlternator: ["{", "| Cycle one.", "| Cycle two.", "}"],
  SingleLineShuffleAlternator: ["{", "| Shuffle one.", "| Shuffle two.", "}"],
  SingleLineAlternatorArmDivert: ["{", "| Leave now.", "| Stay here.", "}"],
  SingleLineAlternatorInterpolation: ["{", "| Wave at {person}.", "| Nod.", "}"],
  SingleLineAlternatorMarkup: ["{", "| A bold arm.", "| A plain arm.", "}"],
  NestedSingleLineAlternators: ["{", "| {", "  | In A.", "  | In B.", "  }", "| Out.", "}"],
  SingleLineAlternatorThenAction: ["{", "| Alpha.", "| Beta.", "}", "After them."],
  SingleLineAlternatorThenDialogue: ["{", "| Alpha.", "| Beta.", "}", "GUIDE", "After them."],
  MarkupOnlyThenWordsBranch: ["{", "| Real words.", "}"],
  MarkupOnlyBranch: [],
  CentredStartBranch: ["{", "| Up   they go.", "}"],
  CentredMiddleAlternatives: ["{", "| They   go   on.", "| Stay.", "}"],
};

export const ONE_BRANCH_LAYOUTS: Record<string, string[]> = {
  LuauSparkdownIfBlock: ["{", "| It rains.", "}"],
  IfElseEmptyElse: ["{", "| Only this.", "}"],
  IfElseifEmptyBodies: [],
  IfElseCommandOnlyBody: ["{", "| Printed.", "}"],
  AlternatorEmptyArm: ["{", "| Kept arm.", "}"],
  SingleLineCycleAlternator: ["{", "| Cycle one.", "| Cycle two.", "}"],
};

export const PRINTED: Record<string, string[]> = {
  ...GLUED_LAYOUTS,
  ...ALTERNATIVE_LAYOUTS,
  ...ONE_BRANCH_LAYOUTS,
  ChoiceMarkup: ["* [A cat .. tail.]"],
  ImplicitActionInterpolation: ["Hello {person} there."],
  InlineDialogueInterpolation: ["GUIDE", "Hi {person} again."],
  ChoiceInterpolation: ["* [Greet {person} warmly.]"],
  ImplicitActionMarkupBesideInterpolation: ["Meet {person} and {guest} now."],
  DialogueNameMarkup: ["GUIDE", "Hello."],
  InlineDialogueLeadingGlued: ["GUIDE", "{cat|dog} outside."],
  InlineDialogueOnlyGlued: ["GUIDE", "{owl|hawk}"],
  DialogueNameParentheticalMarkup: ["GUIDE (V.O.)", "Hello."],
  BlockDialogueNameMarkup: ["GUIDE (quietly)", "Hello there."],
  DialogueNameInterpolation: ["GUIDE {person}: Hi."],
  ImplicitActionHtml: ["A bold &amp; \"quoted\" 'single'  line."],
  ChoiceHtml: ["* [Pick this &amp; \"that\" ]"],
  InlineDialogueHtml: ["GUIDE", "Say hi &amp; \"bye\" ."],
  InlineDialogueHtmlInterpolation: ["GUIDE", "Say {\"<b>hi</b> &amp; </script>\"} now."],
  BlockAction: ["The door creaks."],
  BlockActionInnerBlank: ["First.", "Second."],
  BlockActionLeadingBlank: ["First."],
  BlockDialogue: ["GUIDE", "(softly)", "Hello there."],
  BlockDialogueInnerBlank: ["GUIDE", "First line.", "Second line."],
  BlockHeading: ["INT. ROOM - DAY"],
  BlockHeadingInnerBlank: ["INT. A", "INT. B"],
  BlockTitle: ["THE END"],
  BlockTitleInnerBlank: ["ONE", "TWO"],
  BlockTransitional: ["CUT TO:"],
  BlockTransitionalInnerBlank: ["CUT", "TO:"],
  Branch: ["Inside."],
  Choice: ["* [Stray.]"],
  ChoiceDivert: ["* [Onward.]"],
  ImplicitActionDivert: ["They leave."],
  InlineDialogueDivert: ["GUIDE", "Bye."],
  ImplicitActionTag: ["They go."],
  ImplicitActionCentredStart: ["Up", "they go."],
  ImplicitActionCentredMiddle: ["They", "go", "on."],
  ImplicitActionCentredEnd: ["They go", "on"],
  ImplicitActionTwoCentred: ["A", "b", "c", "d", "e."],
  InlineDialogueCentred: ["GUIDE", "Say", "hi", "now."],
  ChoiceCentred: ["* [Go", "c", "d]"],
  ChoiceTag: ["* [Go.]"],
  InlineDialogueTag: ["GUIDE", "Hi."],
  ImplicitActionImageMidLine: ["They go.", "on."],
  ChoiceLineComment: ["* [Go.]"],
  ImplicitActionGlue: ["They go", "on."],
  DualDialogue: ["GUIDE", "Left.", "VISITOR", "Right."],
  ImplicitAction: ["The door creaks."],
  InlineAction: ["The door creaks."],
  InlineDialogue: ["GUIDE", "Hello."],
  InlineHeading: ["INT. ROOM - DAY"],
  InlineTitle: ["THE END"],
  InlineTransitional: ["CUT TO:"],
  LuauFunctionDefinitionSharedLine: ["Same line."],
  LuauFunctionDefinitionThenCommentSharedLine: ["Shared."],
  SparkdownBlockCommentThenFunctionSharedLine: ["Shared."],
  LuauFunctionDefinitionPairSharedLine: ["Shared."],
  LuauSparkdownChooseBlock: ["* [Go.]", "They go."],
  LuauSparkdownDoBlock: ["It snows."],
  LuauSparkdownElseBlock: ["Yes."],
  LuauSparkdownElseifBlock: ["Maybe."],
  LuauSparkdownForLoop: ["Again."],
  LuauSparkdownRepeatLoop: ["It drizzles."],
  LuauSparkdownWhileLoop: ["It hails."],
};

export const compact = (text: string) => text.replace(/\s+/g, "");

export const missingText = (rows: string[], expected: readonly string[]) => {
  const page = compact(rows.join(""));
  return expected.filter((text) => !page.includes(compact(text)));
};

export const BASE: ScreenplayConfig = { screenplay_print_title_page: false };

export const CONFIGS: Record<string, ScreenplayConfig> = {
  default: BASE,
  "scene identifiers": { ...BASE, screenplay_print_scene_identifiers: true },
  "branch identifiers": { ...BASE, screenplay_print_branch_identifiers: true },
  "function identifiers": { ...BASE, screenplay_print_function_identifiers: true },
};

const CHUNK = 24;

const circuit = (() => {
  const names = Object.keys(KINDS);
  const remaining = new Map(names.map((name) => [name, [...names]]));
  const stack = [names[0]!];
  const order: string[] = [];
  while (stack.length) {
    const next = remaining.get(stack.at(-1)!)!;
    if (next.length) stack.push(next.pop()!);
    else order.push(stack.pop()!);
  }
  return order.reverse();
})();

export const CHUNKS = Array.from(
  { length: Math.ceil((circuit.length - 1) / (CHUNK - 1)) },
  (_, index) => circuit.slice(index * (CHUNK - 1), index * (CHUNK - 1) + CHUNK),
);

export const sourceOf = (kinds: readonly string[]) =>
  ["scene s", "  Before.", ...kinds.flatMap((kind) => KINDS[kind]!), "  After.", "end", ""].join("\n");

export const views = new Map<string, EditorView>();

export const closeViews = () => {
  for (const view of views.values()) {
    const parent = view.dom.parentElement;
    view.destroy();
    parent?.remove();
  }
  views.clear();
};

export const show = (configName: string, source: string): EditorView => {
  let view = views.get(configName);
  if (!view) {
    const parent = document.body.appendChild(document.createElement("div"));
    parent.style.width = "800px";
    view = createEditorView(parent, {
      textDocument: { uri: "file:///main.sd", version: 1, text: "" },
      config: CONFIGS[configName],
    });
    views.set(configName, view);
  }
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source } });
  settleParse(view);
  return view;
};

const hiddenByClass = new Map<string, boolean>();

export const isHidden = (element: Element, cache: boolean) => {
  const key = `${element.tagName}|${element.className}|${element.getAttribute("style") ?? ""}`;
  if (cache && hiddenByClass.has(key)) return hiddenByClass.get(key)!;
  const style = getComputedStyle(element);
  const hidden = style.display === "none" || style.visibility === "hidden";
  if (cache) hiddenByClass.set(key, hidden);
  return hidden;
};

export const visibleText = (element: Element): string => {
  let text = "";
  element.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? "";
    else if (node.nodeType === Node.ELEMENT_NODE && !isHidden(node as Element, true))
      text += visibleText(node as Element);
  });
  return text;
};

export const trimBlankRows = (rows: string[]) => {
  while (rows[0] === "") rows.shift();
  while (rows.at(-1) === "") rows.pop();
  return rows;
};

export const rowsOf = (view: EditorView): string[] => {
  const rows: string[] = [];
  for (const row of Array.from(view.contentDOM.children)) {
    if (isHidden(row, false)) continue;
    const text = visibleText(row);
    if (text.trim() && getComputedStyle(row).opacity !== "0") rows.push(text.trim());
    else if (text.length > 0 || row.querySelector("br")) rows.push("");
  }
  return rows;
};

export const screenRows = (configName: string, source: string): string[] => {
  const view = show(configName, source);
  expect(view.contentDOM.querySelector(".cm-gap"), "every line rendered").toBeNull();
  return trimBlankRows(rowsOf(view));
};

export const exportRows = (configName: string, source: string): string[] => {
  const config = CONFIGS[configName];
  return trimBlankRows(
    extractPdfText(source, config)
      .split("\n")
      .filter((row) => !isHiddenIdentifier(row.match(/^<(\w+)>/)?.[1], config))
      .map((row) => row.replace(/^<[^>]*> ?/, "").trim()),
  );
};

const BLANK = "¶";

export const layout = (rows: string[]) =>
  rows
    .map((row) => row || BLANK)
    .join("")
    .replace(/\s+/g, "");

export const difference = (screen: string[], printed: string[]) => {
  const page = layout(screen);
  const pdf = layout(printed);
  if (page === pdf) return "";
  let at = 0;
  while (at < page.length && page[at] === pdf[at]) at++;
  const around = (text: string) => text.slice(Math.max(0, at - 40), at + 40);
  return `page "${around(page)}" export "${around(pdf)}" (${BLANK} is a blank line)`;
};

interface CharacterStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: string;
  source?: boolean;
}

export const flagsOf = (style: CharacterStyle) =>
  [
    style.bold ? "b" : "",
    style.italic ? "i" : "",
    style.underline ? "u" : "",
    style.align === "center" ? "c" : style.align === "right" ? "r" : "",
    style.source ? "s" : "",
  ].join("");

const signed = (character: string, style: CharacterStyle) => {
  const flags = flagsOf(style);
  return flags && /\S/.test(character) ? `${character}(${flags})` : "";
};

const NAME_TAGS = new Set(["scene", "function", "knot", "stitch", "branch"]);

const exportStyle = (configName: string, source: string): string => {
  const spans = generateScreenplayPrintData(new ScreenplayParser().parse(source), CONFIGS[configName]).spans;
  const lines: PageLine[] = spans.flatMap((span) =>
    span.tag === "meta" || span.tag === "page_break" || span.tag === "separator"
      ? []
      : span.tag === "dual"
        ? [...(span.positions.l ?? []), ...(span.positions.r ?? [])]
        : span.lines,
  );
  return lines
    .filter((line) => !NAME_TAGS.has(line.tag))
    .map((line) => {
      const text = line.content.map((piece) => piece.text).join("");
      const scene = line.scene !== undefined ? `#${line.scene}${line.sceneBold ? "b" : ""}[${compact(text)}]` : "";
      return (
        scene +
        line.content
          .map((piece) =>
            Array.from(piece.text, (character) =>
              signed(character, { ...piece, source: piece.color === SOURCE_COLOR }),
            ).join(""),
          )
          .join("")
      );
    })
    .join("");
};

export const pageStyleOf = (element: Element, row: Element, cache: Map<Element, CharacterStyle>): CharacterStyle => {
  const known = cache.get(element);
  if (known) return known;
  const inherited = element === row || !element.parentElement ? {} : pageStyleOf(element.parentElement, row, cache);
  const style = getComputedStyle(element);
  const weight = style.fontWeight;
  const block = style.display === "block" || element.tagName === "DIV";
  const align = style.textAlign === "center" || style.textAlign === "right" ? style.textAlign : "";
  const result: CharacterStyle = {
    bold: inherited.bold || weight === "bold" || Number(weight) >= 600,
    italic: inherited.italic || style.fontStyle === "italic",
    underline: inherited.underline || /underline/.test(`${style.textDecoration} ${style.textDecorationLine}`),
    align: (block && align) || inherited.align,
    source: inherited.source || element.classList.contains("sp-source"),
  };
  cache.set(element, result);
  return result;
};

export const numberIsBold = (row: Element) =>
  Array.from(row.ownerDocument.styleSheets).some((sheet) =>
    Array.from(sheet.cssRules).some(
      (rule) =>
        rule instanceof CSSStyleRule &&
        (rule.style.getPropertyValue("font-weight") === "bold" || Number(rule.style.getPropertyValue("font-weight")) >= 600) &&
        rule.selectorText.split(",").some((selector) => {
          const pseudo = selector.trim().match(/^(.*)::(before|after)$/);
          return !!pseudo && row.matches(pseudo[1]!);
        }),
    ),
  );

const pageStyle = (view: EditorView): string => {
  const cache = new Map<Element, CharacterStyle>();
  let out = "";
  const visit = (element: Element, row: Element) => {
    element.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const style = pageStyleOf(element, row, cache);
        out += Array.from(node.textContent ?? "", (character) => signed(character, style)).join("");
      } else if (
        node.nodeType === Node.ELEMENT_NODE &&
        !(node as Element).classList.contains("sp-name") &&
        !isHidden(node as Element, true)
      ) {
        visit(node as Element, row);
      }
    });
  };
  for (const row of Array.from(view.contentDOM.children)) {
    if (isHidden(row, false)) continue;
    const shown = getComputedStyle(row).opacity !== "0";
    const number = (row as HTMLElement).dataset["sceneNumber"];
    if (row.classList.contains("sp-heading") && number !== undefined) {
      out += `#${number}${numberIsBold(row) ? "b" : ""}[${shown ? compact(visibleText(row)) : ""}]`;
    }
    if (shown) visit(row, row);
  }
  return out;
};

export const unplacedText = (configName: string, source: string) =>
  screenplayPageLayout(syntaxTree(views.get(configName)!.state), source, CONFIGS[configName]).unplaced;

export const styleDifference = (configName: string, source: string) => {
  const page = pageStyle(views.get(configName)!);
  const pdf = exportStyle(configName, source);
  if (page === pdf) return "";
  let at = 0;
  while (at < page.length && page[at] === pdf[at]) at++;
  const around = (text: string) => text.slice(Math.max(0, at - 40), at + 40);
  return `styles: page "${around(page)}" export "${around(pdf)}" (b bold, i italic, u underline, c centred, r right, s source, #n[row] scene number)`;
};

export const describeElementSequences = (configName: string, part: number, parts: number) => {
  const size = Math.ceil(CHUNKS.length / parts);
  const first = (part - 1) * size;
  const chunks = CHUNKS.slice(first, first + size);
  afterAll(closeViews);
  describe("screenplay page and export agree on blank lines", () => {
    it(
      `for every element sequence with ${configName} settings, part ${part} of ${parts}`,
      async () => {
        const view = show(configName, sourceOf([]));
        await new Promise<void>((resolve) => view.requestMeasure({ read: () => undefined, write: () => resolve() }));
        const failures: string[] = [];
        for (const [offset, kinds] of chunks.entries()) {
          const index = first + offset;
          await new Promise((resolve) => setTimeout(resolve, 0));
          const source = sourceOf(kinds);
          const screen = screenRows(configName, source);
          const printed = exportRows(configName, source);
          const found = difference(screen, printed);
          if (found) {
            failures.push(`sequence ${index}: ${found}; kinds ${kinds.join(" > ")}`);
          }
          const styles = styleDifference(configName, source);
          if (styles) {
            failures.push(`sequence ${index}: ${styles}; kinds ${kinds.join(" > ")}`);
          }
          const unplaced = unplacedText(configName, source);
          if (unplaced.length) {
            failures.push(`sequence ${index}: the export printed text the page has no place for ${JSON.stringify(unplaced)}; kinds ${kinds.join(" > ")}`);
          }
          const missing = missingText(screen, kinds.flatMap((kind) => PRINTED[kind] ?? []));
          if (missing.length) {
            failures.push(`sequence ${index}: page lacks ${JSON.stringify(missing)}; kinds ${kinds.join(" > ")}`);
          }
        }
        expect(failures).toEqual([]);
      },
      600_000,
    );
  });
};
