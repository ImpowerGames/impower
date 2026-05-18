import { InkObject } from "./Object";

export class ControlCommand extends InkObject {
  private _commandType: ControlCommand.CommandType;

  get commandType(): ControlCommand.CommandType {
    return this._commandType;
  }

  // For `RunStdLibFunction` ControlCommands — carry the source-level
  // builtin name (e.g. `"assert"`, `"plural.category"`) and the call-
  // site arity. These are populated by `RunStdLib(name, arity)` and
  // read by both the runtime dispatcher (looks up `STDLIB[name]`
  // and pops `arity` args) and the JSON serializer (encodes as
  // `"stdlib:<name>:<arity>"`). Unused for other ControlCommand types.
  public _stdLibName: string = "";
  public _stdLibArity: number = 0;

  // For `PackTuple` / `UnpackTuple` ControlCommands — carry the
  // arity (number of values to pack into a `MultiValue`, or number
  // of slots to unpack the top `MultiValue` into). Populated by
  // `PackTuple(n)` / `UnpackTuple(n)` and read by both the runtime
  // dispatcher and the JSON serializer (encoded as `"pack:<n>"` /
  // `"unpack:<n>"`).
  public _tupleArity: number = 0;

  constructor(
    commandType: ControlCommand.CommandType = ControlCommand.CommandType.NotSet,
  ) {
    super();
    this._commandType = commandType;
  }

  public Copy() {
    const copy = new ControlCommand(this.commandType);
    copy._stdLibName = this._stdLibName;
    copy._stdLibArity = this._stdLibArity;
    copy._tupleArity = this._tupleArity;
    return copy;
  }
  public static EvalStart() {
    return new ControlCommand(ControlCommand.CommandType.EvalStart);
  }
  public static EvalOutput() {
    return new ControlCommand(ControlCommand.CommandType.EvalOutput);
  }
  public static EvalEnd() {
    return new ControlCommand(ControlCommand.CommandType.EvalEnd);
  }
  public static Duplicate() {
    return new ControlCommand(ControlCommand.CommandType.Duplicate);
  }
  public static PopEvaluatedValue() {
    return new ControlCommand(ControlCommand.CommandType.PopEvaluatedValue);
  }
  public static PopFunction() {
    return new ControlCommand(ControlCommand.CommandType.PopFunction);
  }
  public static PopTunnel() {
    return new ControlCommand(ControlCommand.CommandType.PopTunnel);
  }
  public static BeginString() {
    return new ControlCommand(ControlCommand.CommandType.BeginString);
  }
  public static EndString() {
    return new ControlCommand(ControlCommand.CommandType.EndString);
  }
  public static NoOp() {
    return new ControlCommand(ControlCommand.CommandType.NoOp);
  }
  public static TurnsSince() {
    return new ControlCommand(ControlCommand.CommandType.TurnsSince);
  }
  public static ReadCount() {
    return new ControlCommand(ControlCommand.CommandType.ReadCount);
  }
  public static VisitIndex() {
    return new ControlCommand(ControlCommand.CommandType.VisitIndex);
  }
  public static SequenceShuffleIndex() {
    return new ControlCommand(ControlCommand.CommandType.SequenceShuffleIndex);
  }
  public static StartThread() {
    return new ControlCommand(ControlCommand.CommandType.StartThread);
  }
  public static Done() {
    return new ControlCommand(ControlCommand.CommandType.Done);
  }
  public static End() {
    return new ControlCommand(ControlCommand.CommandType.End);
  }
  public static ListFromInt() {
    return new ControlCommand(ControlCommand.CommandType.ListFromInt);
  }
  public static ListRange() {
    return new ControlCommand(ControlCommand.CommandType.ListRange);
  }
  public static ListRandom() {
    return new ControlCommand(ControlCommand.CommandType.ListRandom);
  }
  public static BeginTag() {
    return new ControlCommand(ControlCommand.CommandType.BeginTag);
  }
  public static EndTag() {
    return new ControlCommand(ControlCommand.CommandType.EndTag);
  }
  public static BeginObject() {
    return new ControlCommand(ControlCommand.CommandType.BeginObject);
  }
  public static EndObject() {
    return new ControlCommand(ControlCommand.CommandType.EndObject);
  }
  public static IndexValue() {
    return new ControlCommand(ControlCommand.CommandType.IndexValue);
  }
  public static StoreIndex() {
    return new ControlCommand(ControlCommand.CommandType.StoreIndex);
  }
  public static CallValueAsFunction() {
    return new ControlCommand(ControlCommand.CommandType.CallValueAsFunction);
  }
  public static BeginScope() {
    return new ControlCommand(ControlCommand.CommandType.BeginScope);
  }
  public static EndScope() {
    return new ControlCommand(ControlCommand.CommandType.EndScope);
  }
  // Generic state-aware stdlib call. Pops `arity` args from the eval
  // stack and calls `STDLIB[name].fn(story, args)`. The
  // registered function may push a return value back onto the stack
  // (for value-returning builtins like `tostring`) or return
  // undefined (for side-effecting ones like `assert`). See StdLib.ts
  // for the registry. Adding a new state-aware Luau builtin is a
  // one-line entry there — no new ControlCommand opcode, no
  // FunctionCall dispatch branch, no Story.ts runtime case.
  public static RunStdLib(name: string, arity: number) {
    const cmd = new ControlCommand(
      ControlCommand.CommandType.RunStdLibFunction,
    );
    cmd._stdLibName = name;
    cmd._stdLibArity = arity;
    return cmd;
  }
  // `PackTuple(n)` — at runtime: pop `n` values off the eval stack
  // and push one `MultiValue` wrapping them (in original push-order:
  // first-pushed value at index 0). Emitted by the multi-return
  // lowering for `return a, b, c`.
  public static PackTuple(arity: number) {
    const cmd = new ControlCommand(ControlCommand.CommandType.PackTuple);
    cmd._tupleArity = arity;
    return cmd;
  }
  // `UnpackTuple(n)` — at runtime: pop the top eval-stack slot.
  // If it's a `MultiValue`, push the first `n` inner values in
  // REVERSE order (so subsequent `Pop`s receive value-0 first).
  // If it's a regular value, push it as value-0 followed by `n-1`
  // `NullValue`s. Emitted by the multi-target assignment lowering
  // for `local a, b = expr`.
  public static UnpackTuple(arity: number) {
    const cmd = new ControlCommand(ControlCommand.CommandType.UnpackTuple);
    cmd._tupleArity = arity;
    return cmd;
  }
  public toString() {
    return "ControlCommand " + this.commandType.toString();
  }
}

export namespace ControlCommand {
  export enum CommandType {
    NotSet = -1,
    EvalStart, // 0
    EvalOutput, // 1
    EvalEnd, // 2
    Duplicate, // 3
    PopEvaluatedValue, // 4
    PopFunction, // 5
    PopTunnel, // 6
    BeginString, // 7
    EndString, // 8
    NoOp, // 9
    TurnsSince, // 10
    ReadCount, // 11
    VisitIndex, // 12
    SequenceShuffleIndex, // 13
    StartThread, // 14
    Done, // 15
    End, // 16
    ListFromInt, // 17
    ListRange, // 18
    ListRandom, // 19
    BeginTag, // 20
    EndTag, // 21
    BeginObject, // 22
    EndObject, // 23
    IndexValue, // 24
    StoreIndex, // 25
    // Pops a `DivertTargetValue` off the eval stack, then pushes a Function
    // call-stack frame and diverts to the target's path. Args for the call
    // must already be on the eval stack below the target — they remain there
    // for the function's parameter-binding bytecode at entry to consume.
    // Used by the upcoming unified-ObjectValue method-dispatch design:
    // `obj:method(a, b)` evaluates to "push receiver, push a, push b,
    // load method as DivertTargetValue, CallValueAsFunction".
    CallValueAsFunction, // 26

    // Push / pop a temporary-variable scope frame on the current call-
    // stack element. Sparkdown emits these around block bodies (`if`/
    // `for`/`while`/`repeat`/`do`) so `local x` declarations follow
    // Luau's block-scoping rules: an inner `local x` shadows an outer
    // `x` for the rest of the inner block, and the outer `x` is visible
    // again after EndScope. Without these markers, sparkdown would
    // inherit ink's function-scoped `temp` semantics — surprising for
    // anyone writing luau-style code.
    BeginScope, // 27
    EndScope, // 28

    // Generic dispatcher for state-aware Luau builtins. Carries the
    // function name + arity as instance data (`_stdLibName`,
    // `_stdLibArity`) — JSON serialization encodes both into a single
    // `"stdlib:<name>:<arity>"` token. Runtime looks up the name in
    // `STDLIB` and pops `arity` args. See `RunStdLib()`.
    RunStdLibFunction, // 29

    // Lua/Luau multi-return support. `PackTuple` pops N values and
    // pushes one `MultiValue` wrapping them — emitted by
    // `return a, b, c`. `UnpackTuple` pops the top slot (MultiValue
    // or single) and pushes N values padded with nil — emitted by
    // `local a, b = expr` so each target's `VariableAssignment` can
    // pop one value as usual. Both carry their N as `_tupleArity`.
    PackTuple, // 30
    UnpackTuple, // 31

    TOTAL_VALUES,
  }
}
