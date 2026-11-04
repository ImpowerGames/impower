import { describe, expect, test } from "vitest";
import "../engineUnderTest";
import { NativeFunctionCall } from "../../runtime/NativeFunctionCall";
import { InkObject } from "../../runtime/Object";
import {
  BoolValue,
  FloatValue,
  IntValue,
  NullValue,
  ObjectValue,
  StringValue,
  Value,
} from "../../runtime/Value";

const TYPELESS_OPS: Array<[string, number]> = [
  [NativeFunctionCall.Not, 1],
  [NativeFunctionCall.LuauTruthy, 1],
  [NativeFunctionCall.And, 2],
  [NativeFunctionCall.Or, 2],
  [NativeFunctionCall.Concat, 2],
];

const operands = (): Array<[string, InkObject, boolean]> => [
  ["int 0", new IntValue(0), true],
  ["int 3", new IntValue(3), true],
  ["float 0", new FloatValue(0), true],
  ["float 2.5", new FloatValue(2.5), true],
  ["empty string", new StringValue(""), true],
  ["string", new StringValue("x"), true],
  ["true", new BoolValue(true), true],
  ["false", new BoolValue(false), false],
  ["nil", new NullValue(), false],
  ["empty table", new ObjectValue(), true],
];

const call = (name: string, params: InkObject[]) =>
  NativeFunctionCall.CallWithName(name).Call(params);

describe("typeless native operators", () => {
  test.each(TYPELESS_OPS)(
    "%s resolves by name with arity %i and has no per-type bodies",
    (name, arity) => {
      const prototype = NativeFunctionCall.CallExistsWithName(name);
      expect(prototype).toBeDefined();
      expect(prototype!.numberOfParameters).toBe(arity);
      expect(prototype!._operationFuncs).toBeNull();
      expect(NativeFunctionCall.CallWithName(name).numberOfParameters).toBe(
        arity,
      );
    },
  );

  test.each(operands())("not and TRUTHY of %s use Luau truthiness", (_, v, truthy) => {
    expect((call(NativeFunctionCall.Not, [v]) as BoolValue).value).toBe(
      !truthy,
    );
    expect((call(NativeFunctionCall.LuauTruthy, [v]) as BoolValue).value).toBe(
      truthy,
    );
  });

  test.each(operands())("and/or with left operand %s pick by Luau truthiness", (_, a, truthy) => {
    const b = new StringValue("right");
    expect(call(NativeFunctionCall.And, [a, b])).toBe(truthy ? b : a);
    expect(call(NativeFunctionCall.Or, [a, b])).toBe(truthy ? a : b);
  });

  test("concat joins strings and numbers and rejects other types", () => {
    const joined = call(NativeFunctionCall.Concat, [
      new IntValue(1),
      new FloatValue(2.5),
    ]) as Value<string>;
    expect(joined).toBeInstanceOf(StringValue);
    expect(joined.value).toBe("12.5");
    expect(
      (call(NativeFunctionCall.Concat, [
        new StringValue("a"),
        new IntValue(0),
      ]) as Value<string>).value,
    ).toBe("a0");
    expect(() =>
      call(NativeFunctionCall.Concat, [new IntValue(0), new BoolValue(true)]),
    ).toThrow(/attempt to concatenate number with boolean/);
    expect(() =>
      call(NativeFunctionCall.Concat, [new NullValue(), new StringValue("a")]),
    ).toThrow(/attempt to concatenate nil with string/);
  });
});
