import { describe, expect, test } from "vitest";
import {
  answered,
  changed,
  drafted,
  emptyFields,
  fieldsView,
  hostSent,
  resetAll,
  startChanged,
  type StartingValuesFields,
} from "../route/startingValuesFields";

const S = "interrogation";
const OTHER = "ending";
const first = (key: string) => (key === "store:trust" ? "0" : undefined);

const kept = (values: Record<string, Record<string, string>> = {}) =>
  hostSent(emptyFields(), values);

const view = (state: StartingValuesFields, start = S) =>
  fieldsView(state, start);

describe("the Starting values fields", () => {
  test("a field's text is its draft until it is cleared", () => {
    let state = drafted(kept(), S, "store:trust", "{ unclosed");
    expect(view(state).drafts).toEqual({ "store:trust": "{ unclosed" });
    expect(view(state, OTHER).drafts).toEqual({});
    state = drafted(state, S, "store:trust", null);
    expect(view(state).drafts).toEqual({});
    expect(state.fields.size).toBe(0);
  });

  test("a change shows at once, and the host's values take over once it kept it", () => {
    let state = drafted(kept({ [S]: { "store:trust": "1" } }), S, "store:trust", "{");
    const change = changed(state, S, { "store:trust": "2" });
    state = change.state;
    expect(view(state)).toEqual({
      values: { "store:trust": "2" },
      drafts: {},
      unsaved: {},
    });
    state = answered(state, S, change.edit, true, first);
    expect(view(state).values).toEqual({ "store:trust": "2" });
    state = hostSent(state, { [S]: { "store:trust": "2" } });
    expect(view(state).values).toEqual({ "store:trust": "2" });
    expect(state.fields.size).toBe(0);
  });

  test("a change the host refused after a later change to the field leaves the later one", () => {
    let state = kept();
    const earlier = changed(state, S, { "store:trust": "2" });
    const later = changed(earlier.state, S, { "store:trust": "3" });
    state = answered(later.state, S, later.edit, true, first);
    state = hostSent(state, { [S]: { "store:trust": "3" } });
    state = answered(state, S, earlier.edit, false, first);
    expect(view(state)).toEqual({
      values: { "store:trust": "3" },
      drafts: {},
      unsaved: {},
    });
  });

  test("a change the host refused goes back to the value the host last sent, with its badge", () => {
    let state = kept({ [S]: { "store:trust": "1" } });
    const change = changed(state, S, { "store:trust": "2" });
    state = hostSent(change.state, { [S]: { "store:trust": "5" } });
    expect(view(state).values).toEqual({ "store:trust": "2" });
    state = answered(state, S, change.edit, false, first);
    expect(view(state)).toEqual({
      values: { "store:trust": "5" },
      drafts: {},
      unsaved: { "store:trust": "5" },
    });
    const unset = changed(kept(), S, { "store:trust": "2" });
    expect(
      view(answered(unset.state, S, unset.edit, false, first)).unsaved,
    ).toEqual({ "store:trust": "0" });
  });

  test("a failure that arrives after the panel moved to another start stays with its own start", () => {
    let state = drafted(kept({ [S]: { "store:trust": "1" } }), OTHER, "store:x", "{");
    const change = changed(state, S, { "store:trust": "2" });
    state = startChanged(change.state, OTHER);
    expect(view(state).values).toEqual({ "store:trust": "2" });
    expect(view(state, OTHER).drafts).toEqual({ "store:x": "{" });
    state = answered(state, S, change.edit, false, first);
    expect(view(state, OTHER)).toEqual({ values: {}, drafts: { "store:x": "{" }, unsaved: {} });
    expect(view(state)).toEqual({
      values: { "store:trust": "1" },
      drafts: {},
      unsaved: { "store:trust": "1" },
    });
    state = startChanged(state, S);
    expect(view(state, OTHER).drafts).toEqual({});
  });

  test("× on a field holding text clears both its value and its text", () => {
    let state = drafted(kept({ [S]: { "store:trust": "2" } }), S, "store:trust", "{ unclosed");
    const change = changed(state, S, { "store:trust": null });
    state = change.state;
    expect(view(state)).toEqual({ values: {}, drafts: {}, unsaved: {} });
    state = answered(state, S, change.edit, true, first);
    state = hostSent(state, {});
    expect(view(state)).toEqual({ values: {}, drafts: {}, unsaved: {} });
    expect(state.fields.size).toBe(0);
  });

  test("Reset all clears every value and every field's text of its start only", () => {
    let state = kept({
      [S]: { "store:trust": "2", "param:hour": '"nine"' },
      [OTHER]: { "store:x": "1" },
    });
    state = drafted(state, S, "store:suspect", "{");
    state = drafted(state, S, "store:trust", "{ unclosed");
    const reset = resetAll(state, S);
    expect(reset.changes).toEqual({ "store:trust": null, "param:hour": null });
    expect(view(reset.state).drafts).toEqual({});
    const cleared = changed(reset.state, S, reset.changes);
    expect(view(cleared.state).values).toEqual({});
    expect(view(cleared.state, OTHER).values).toEqual({ "store:x": "1" });
  });

  test("the host's values clear a badge for a field it now keeps, and keep text and unanswered changes", () => {
    let state = kept({ [S]: { "store:trust": "1" } });
    const refused = changed(state, S, { "store:trust": "2" });
    state = answered(refused.state, S, refused.edit, false, first);
    state = drafted(state, S, "store:suspect", "{");
    const open = changed(state, S, { "param:hour": '"ten"' });
    state = hostSent(open.state, { [S]: { "store:trust": "4" } });
    expect(view(state)).toEqual({
      values: { "store:trust": "4", "param:hour": '"ten"' },
      drafts: { "store:suspect": "{" },
      unsaved: {},
    });
    state = hostSent(state, { [S]: { "store:trust": "4", "param:hour": '"ten"' } });
    expect(view(state).values).toEqual({
      "store:trust": "4",
      "param:hour": '"ten"',
    });
    expect([...state.fields.keys()]).toEqual([`${S}\nstore:suspect`]);
  });
});
