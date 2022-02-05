import { PushPopType } from "../types/PushPopType";
import { JsonSerialisation } from "./JsonSerialisation";
import { JsonWriter } from "./JsonWriter";
import { NullException } from "./NullException";
import { Path } from "./Path";
import { Pointer } from "./Pointer";
import { RuntimeObject } from "./RuntimeObject";
import { Story } from "./Story";
import { ThreadElement } from "./ThreadElement";

export class Thread {
  public callstack: ThreadElement[];

  public threadIndex = 0;

  public previousPointer: Pointer = Pointer.Null;

  constructor();

  constructor(jThreadObj: unknown, storyContext: Story);

  constructor(...args) {
    this.callstack = [];

    if (args[0] && args[1]) {
      const jThreadObj = args[0] as {
        callstack?: {
          type?: PushPopType;
          cPath?: string;
          idx?: number;
          exp?: boolean;
          temp?: Record<string, unknown>;
          temporaryVariables?: Record<string, RuntimeObject>;
        }[];
        threadIndex?: number;
        previousContentObject?: string;
      };
      // eslint-disable-next-line prefer-rest-params
      const storyContext = args[1];

      // TODO: (int) jThreadObj['threadIndex'] can raise;
      this.threadIndex = Number(jThreadObj.threadIndex);

      const jThreadCallstack = jThreadObj.callstack;

      jThreadCallstack.forEach((jElTok) => {
        const jElementObj = jElTok;

        // TODO: (int) jElementObj['type'] can raise;
        const pushPopType: PushPopType = jElementObj.type;

        const pointer = Pointer.Null;

        let currentContainerPathStr: string;
        // TODO: jElementObj.TryGetValue ("cPath", out currentContainerPathStrToken);
        const currentContainerPathStrToken = jElementObj.cPath;
        if (typeof currentContainerPathStrToken !== "undefined") {
          currentContainerPathStr = currentContainerPathStrToken.toString();

          const threadPointerResult = storyContext.ContentAtPath(
            new Path(currentContainerPathStr)
          );
          pointer.container = threadPointerResult.container;
          pointer.index = Number(jElementObj.idx);

          if (threadPointerResult.obj == null)
            throw new Error(
              `When loading state, internal story location couldn't be found: ${currentContainerPathStr}. Has the story changed since this save data was created?`
            );
          else if (threadPointerResult.approximate) {
            if (pointer.container === null) {
              throw new NullException("pointer.container");
            }
            storyContext.Warning(
              `When loading state, exact internal story location couldn't be found: '${currentContainerPathStr}', so it was approximated to '${pointer.container.path.toString()}' to recover. Has the story changed since this save data was created?`
            );
          }
        }

        const inExpressionEvaluation = !!jElementObj.exp;

        const el = new ThreadElement(
          pushPopType,
          pointer,
          inExpressionEvaluation
        );

        const temps = jElementObj.temp;
        if (typeof temps !== "undefined") {
          el.temporaryVariables =
            JsonSerialisation.JObjectToDictionaryRuntimeObjs(temps);
        } else {
          el.temporaryVariables = {};
        }

        this.callstack.push(el);
      });

      const prevContentObjPath = jThreadObj.previousContentObject;
      if (typeof prevContentObjPath !== "undefined") {
        const prevPath = new Path(prevContentObjPath.toString());
        this.previousPointer = storyContext.PointerAtPath(prevPath);
      }
    }
  }

  public Copy(): Thread {
    const copy = new Thread();
    copy.threadIndex = this.threadIndex;
    this.callstack.forEach((e) => {
      copy.callstack.push(e.Copy());
    });
    copy.previousPointer = this.previousPointer.copy();
    return copy;
  }

  public WriteJson(writer: JsonWriter): void {
    writer.WriteObjectStart();

    writer.WritePropertyStart("callstack");
    writer.WriteArrayStart();
    this.callstack.forEach((el) => {
      writer.WriteObjectStart();
      if (!el.currentPointer.isNull) {
        if (el.currentPointer.container === null) {
          throw new NullException("el.currentPointer.container");
        }
        writer.WriteProperty(
          "cPath",
          el.currentPointer.container.path.componentsString
        );
        writer.WriteIntProperty("idx", el.currentPointer.index);
      }

      writer.WriteProperty("exp", el.inExpressionEvaluation);
      writer.WriteProperty("type", el.type);

      if (Object.keys(el.temporaryVariables || {}).length > 0) {
        writer.WritePropertyStart("temp");
        JsonSerialisation.WriteDictionaryRuntimeObjs(
          writer,
          el.temporaryVariables
        );
        writer.WritePropertyEnd();
      }

      writer.WriteObjectEnd();
    });
    writer.WriteArrayEnd();
    writer.WritePropertyEnd();

    writer.WriteIntProperty("threadIndex", this.threadIndex);

    if (!this.previousPointer.isNull) {
      const resolvedPointer = this.previousPointer.Resolve();
      if (resolvedPointer === null) {
        throw new NullException("this.previousPointer.Resolve()");
      }
      writer.WriteProperty(
        "previousContentObject",
        resolvedPointer.path.toString()
      );
    }

    writer.WriteObjectEnd();
  }
}
