import { IStory } from "../types/IStory";
import { CallStack } from "./CallStack";
import { Choice } from "./Choice";
import { JsonSerialisation } from "./JsonSerialisation";
import { JsonWriter } from "./JsonWriter";
import { NullException } from "./NullException";
import { RuntimeObject } from "./RuntimeObject";
import { Thread } from "./Thread";

export class Flow {
  public name: string = null;

  public callStack: CallStack = null;

  public outputStream: RuntimeObject[] = null;

  public currentChoices: Choice[] = null;

  constructor(name: string, story: IStory);

  constructor(name: string, story: IStory, jObject: Record<string, unknown>);

  constructor(...args) {
    const name = args[0] as string;
    const story = args[1] as IStory;

    this.name = name;
    this.callStack = new CallStack(story);

    if (args[2]) {
      const jObject = args[2] as {
        callstack?: Record<string, unknown>;
        outputStream?: unknown[];
        currentChoices?: unknown[];
        choiceThreads?: Record<string, unknown>;
      };

      this.callStack.SetJsonToken(jObject.callstack, story);
      this.outputStream = JsonSerialisation.JArrayToRuntimeObjList(
        jObject.outputStream
      );
      this.currentChoices = JsonSerialisation.JArrayToRuntimeObjList(
        jObject.currentChoices
      ) as Choice[];

      const jChoiceThreadsObj = jObject.choiceThreads;
      if (typeof jChoiceThreadsObj !== "undefined") {
        this.LoadFlowChoiceThreads(jChoiceThreadsObj, story);
      }
    } else {
      this.outputStream = [];
      this.currentChoices = [];
    }
  }

  public WriteJson(writer: JsonWriter): void {
    writer.WriteObjectStart();

    writer.WriteProperty("callstack", (w) => this.callStack.WriteJson(w));
    writer.WriteProperty("outputStream", (w) =>
      JsonSerialisation.WriteListRuntimeObjs(w, this.outputStream)
    );

    let hasChoiceThreads = false;
    this.currentChoices.forEach((c) => {
      if (c.threadAtGeneration === null) {
        throw new NullException("c.threadAtGeneration");
      }

      c.originalThreadIndex = c.threadAtGeneration.threadIndex;

      if (this.callStack.ThreadWithIndex(c.originalThreadIndex) === null) {
        if (!hasChoiceThreads) {
          hasChoiceThreads = true;
          writer.WritePropertyStart("choiceThreads");
          writer.WriteObjectStart();
        }

        writer.WritePropertyStart(String(c.originalThreadIndex));
        c.threadAtGeneration.WriteJson(writer);
        writer.WritePropertyEnd();
      }
    });

    if (hasChoiceThreads) {
      writer.WriteObjectEnd();
      writer.WritePropertyEnd();
    }

    writer.WriteProperty("currentChoices", (w) => {
      w.WriteArrayStart();
      this.currentChoices.forEach((c) => {
        JsonSerialisation.WriteChoice(w, c);
      });
      w.WriteArrayEnd();
    });

    writer.WriteObjectEnd();
  }

  public LoadFlowChoiceThreads(
    jChoiceThreads: Record<string, unknown>,
    story: IStory
  ): void {
    this.currentChoices.forEach((choice) => {
      const foundActiveThread = this.callStack.ThreadWithIndex(
        choice.originalThreadIndex
      );
      if (foundActiveThread !== null) {
        choice.threadAtGeneration = foundActiveThread.Copy();
      } else {
        const jSavedChoiceThread =
          jChoiceThreads[`${choice.originalThreadIndex}`];
        choice.threadAtGeneration = new Thread(jSavedChoiceThread, story);
      }
    });
  }
}
