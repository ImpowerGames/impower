// A style block key may list SEVERAL state selectors, because that is how the
// states actually behave — Pico gives a button the same treatment on
// `:hover, :active, :focus`, and writing them separately triples the block.
//
// Every listed compound has to be anchored to the element with `&`. Anchoring
// only the first emits `&:hover, :active { … }`, and under CSS nesting the
// un-anchored ones resolve as DESCENDANT selectors: `.button :active` styles
// any active descendant instead of the button. That is silently wrong, not
// invalid, so nothing would report it — hence this test.

import { describe, expect, test } from "vitest";
import { anchorSelfTargeted } from "@impower/spark-dom/src/utils/getStyleContent";

describe("self-targeted selector anchoring", () => {
  test("anchors every compound in a list", () => {
    expect(anchorSelfTargeted(":hover, :active, :focus")).toBe(
      "&:hover, &:active, &:focus",
    );
  });

  test("anchors attribute selectors too", () => {
    expect(anchorSelfTargeted("[open], :hover")).toBe("&[open], &:hover");
  });

  test("leaves descendant/child compounds alone", () => {
    // These deliberately are NOT self-targeted.
    expect(anchorSelfTargeted(".list .item")).toBe(".list .item");
    expect(anchorSelfTargeted(":hover, .item")).toBe("&:hover, .item");
  });

  test("a comma INSIDE a functional pseudo is not a separator", () => {
    expect(anchorSelfTargeted(":is(:hover, :focus)")).toBe(
      "&:is(:hover, :focus)",
    );
    expect(anchorSelfTargeted(":not([open], [hidden])")).toBe(
      "&:not([open], [hidden])",
    );
  });

  test("a comma inside a quoted attribute value is not a separator", () => {
    expect(anchorSelfTargeted('[title="a, b"]')).toBe('&[title="a, b"]');
    expect(anchorSelfTargeted("[title='a, b'], :hover")).toBe(
      "&[title='a, b'], &:hover",
    );
  });

  test("nested brackets and escaped quotes survive", () => {
    expect(anchorSelfTargeted(':is([data-x="a\\"b, c"]), :focus')).toBe(
      '&:is([data-x="a\\"b, c"]), &:focus',
    );
  });

  test("a single compound is unchanged in behaviour", () => {
    expect(anchorSelfTargeted(":hover")).toBe("&:hover");
    expect(anchorSelfTargeted(".card")).toBe(".card");
  });
});
