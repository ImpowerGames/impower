const SUPPLEMENTARY = String.fromCodePoint(0x10400);

export const BREAKPOINTS: Readonly<Record<string, number>> = { sm: 640 };

export const STANDARD_STATE_CASES: readonly [source: string, css: string][] = [
  ["@hover", ":hover"],
  ["@focus-visible", ":focus-visible"],
  ["@first-child", ":first-child"],
  ["@last-of-type", ":last-of-type"],
  ["@placeholder-shown", ":placeholder-shown"],
  ["@empty", ":empty"],
  ["@has(icon)", ":has(.icon)"],
  ["@not(@hovered)", ":not(:hover)"],
  ["@is(@first, @last)", ":is(:first-child,:last-child)"],
  ["@where(@checked)", ":where(:checked)"],
  ["@nth-child(2)", ":nth-child(2)"],
  ["@dir(rtl)", ":dir(rtl)"],
  ["@lang(en)", ":lang(en)"],
  ["card @first-child", ".card:first-child"],
  ["card @hover, card @focus-visible", ".card:hover,.card:focus-visible"],
  ["@hoveredx", "@hoveredx"],
];

export const ARGUMENT_CASES: readonly [source: string, css: string][] = [
  ["@nth-child(2n of card)", ":nth-child(2n of .card)"],
  ["@nth-last-child(-n + 3 of item.big)", ":nth-last-child(-n + 3 of .item.big)"],
  ["@nth-child(odd of @hovered)", ":nth-child(odd of :hover)"],
  ["@nth-child(2n + 1)", ":nth-child(2n + 1)"],
  ["@nth-of-type(2n + 1)", ":nth-of-type(2n + 1)"],
  ["@lang(en, fr)", ":lang(en, fr)"],
  ["@language(en, fr)", ":lang(en, fr)"],
  ["@language( en )", ":lang(en)"],
  ["@nth-child(odd of @nth-child(odd of author_card))", ":nth-child(odd of :nth-child(odd of .author_card))"],
  ["@nth-child(1 of @lang(en, fr))", ":nth-child(1 of :lang(en, fr))"],
  ["@not(@nth-last-child(-n + 2 of item))", ":not(:nth-last-child(-n + 2 of .item))"],
  ['@nth-child(2n of @lang("en"))', ':nth-child(2n of :lang("en"))'],
  ['@lang("en", fr)', ':lang("en", fr)'],
];

export const NAME_CASES: readonly [source: string, css: string][] = [
  ["@is(card, icon)", ":is(.card,.icon)"],
  ["@is(card,icon)", ":is(.card,.icon)"],
  ["@not(card)", ":not(.card)"],
  ["@where(card, @hovered)", ":where(.card,:hover)"],
  ["@not(@is(card, @first-child))", ":not(:is(.card,:first-child))"],
  ["@nth-child(2n of a,b)", ":nth-child(2n of .a,.b)"],
  ["card@first-child", ".card\\@first-child"],
  ["@not(card@first-child)", ":not(.card\\@first-child)"],
  ["card@night @hovered", ".card\\@night:hover"],
  ["#title=a@b @hovered", "[title=a\\@b]:hover"],
  [`${SUPPLEMENTARY}card`, `.${SUPPLEMENTARY}card`],
  [`@not(${SUPPLEMENTARY}card)`, `:not(.${SUPPLEMENTARY}card)`],
  [`@is(card,${SUPPLEMENTARY}card)`, `:is(.card,.${SUPPLEMENTARY}card)`],
  ["@has(>icon)", ":has(>.icon)"],
  ["@has(+icon)", ":has(+.icon)"],
  ["@has(~icon)", ":has(~.icon)"],
  ["@is(card>icon)", ":is(.card>.icon)"],
  ["@nth-child(2n of card>icon)", ":nth-child(2n of .card>.icon)"],
  ["card>icon", ".card>.icon"],
  ["card+icon", ".card+.icon"],
  ["card~icon", ".card~.icon"],
  ["card,icon", ".card,.icon"],
];

export const PUNCTUATION_CASES: readonly [source: string, css: string][] = [
  ["@media(100px>width)", "@media(100px>width)"],
  ["@container(100px>width)", "@container(100px>width)"],
  ["&[title=blue\\,icon]", "&[title=blue\\,icon]"],
  ["#title=blue\\,icon", "[title=blue\\,icon]"],
  ["#title=a+b", "[title=a+b]"],
  ['#title="x y"', '[title="x y"]'],
  ["#title='x y' @hovered", "[title='x y']:hover"],
];

export const AT_RULE_CASES: readonly [source: string, css: string][] = [
  ["@supports (display: grid)", "@supports(display:grid)"],
  ["@layer base", "@layer base"],
  ["@layer base, theme", "@layer base,theme"],
  ["@media screen and (min-width: 1px)", "@media screen and (min-width:1px)"],
  ["@media (max-width: sm)", "@media(max-width:640px)"],
  ["@container sidebar (min-width: 400px)", "@container sidebar (min-width:400px)"],
  ["@supports not (display: grid)", "@supports not (display:grid)"],
  ["@screen-size( sm )", "@container screen (max-width:640px)"],
  ["@import", "@import"],
];

export const OBJECT_PROPERTY_NAME_CASES: readonly [source: string, css: string][] = [
  ["@constructor", "@constructor"],
  ["@toString(x)", "@toString(x)"],
  ["@__proto__", "@__proto__"],
  ["@hasOwnProperty", "@hasOwnProperty"],
  ["@screen-size(constructor)", "@container screen (max-width:constructor)"],
  ["@container-size(toString)", "@container(max-width:toString)"],
];

export const SHARED_CASES: readonly [source: string, css: string][] = [
  ...STANDARD_STATE_CASES,
  ...ARGUMENT_CASES,
  ...NAME_CASES,
  ...PUNCTUATION_CASES,
  ...AT_RULE_CASES,
  ...OBJECT_PROPERTY_NAME_CASES,
];
