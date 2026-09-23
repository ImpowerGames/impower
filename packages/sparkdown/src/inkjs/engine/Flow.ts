import { CallStack } from "./CallStack";
import { Choice } from "./Choice";
import { JsonSerialisation } from "./JsonSerialisation";
import { InkObject } from "./Object";
import { SimpleJson } from "./SimpleJson";
import { Story } from "./Story";
import { throwNullException } from "./NullException";

export class Flow {
  public name: string;
  public callStack: CallStack;
  public outputStream: InkObject[];
  public currentChoices: Choice[];
  // The part of a step a continue cut off after its line ended, which the
  // next continue starts from (`StoryState.CarryOutputPastCut`).
  public carried: CarriedStep | null = null;

  constructor(name: String, story: Story);
  constructor(name: String, story: Story, jObject: Record<string, any>);
  constructor() {
    let name = arguments[0] as string;
    let story = arguments[1] as Story;

    this.name = name;
    this.callStack = new CallStack(story);

    if (arguments[2]) {
      let jObject = arguments[2] as Record<string, any>;

      this.callStack.SetJsonToken(jObject["callstack"], story);
      this.outputStream = JsonSerialisation.JArrayToRuntimeObjList(
        jObject["outputStream"],
      );
      this.currentChoices = JsonSerialisation.JArrayToRuntimeObjList(
        jObject["currentChoices"],
      ) as Choice[];

      let jCarried = jObject["carried"];
      if (jCarried) {
        this.carried = {
          output: JsonSerialisation.JArrayToRuntimeObjList(jCarried["output"]),
          lineEndPending: jCarried["lineEndPending"] === true,
          paths: (jCarried["paths"] as string[] | undefined) ?? [],
        };
      }

      let jChoiceThreadsObj = jObject["choiceThreads"];
      if (typeof jChoiceThreadsObj !== "undefined") {
        this.LoadFlowChoiceThreads(jChoiceThreadsObj, story);
      }
    } else {
      this.outputStream = [];
      this.currentChoices = [];
    }
  }

  public WriteJson(writer: SimpleJson.Writer) {
    writer.WriteObjectStart();

    writer.WriteProperty("callstack", (w) => this.callStack.WriteJson(w));
    writer.WriteProperty("outputStream", (w) =>
      JsonSerialisation.WriteListRuntimeObjs(w, this.outputStream),
    );
    const carried = this.carried;
    if (carried) {
      writer.WriteProperty("carried", (w) => {
        w.WriteObjectStart();
        w.WriteProperty("output", (o) =>
          JsonSerialisation.WriteListRuntimeObjs(o, carried.output),
        );
        if (carried.lineEndPending) w.WriteProperty("lineEndPending", true);
        if (carried.paths.length > 0) {
          w.WriteProperty("paths", (p) => {
            p.WriteArrayStart();
            for (const path of carried.paths) p.Write(path);
            p.WriteArrayEnd();
          });
        }
        w.WriteObjectEnd();
      });
    }

    let hasChoiceThreads = false;
    for (let c of this.currentChoices) {
      if (c.threadAtGeneration === null)
        return throwNullException("c.threadAtGeneration");

      c.originalThreadIndex = c.threadAtGeneration.threadIndex;

      if (this.callStack.ThreadWithIndex(c.originalThreadIndex) === null) {
        if (!hasChoiceThreads) {
          hasChoiceThreads = true;
          writer.WritePropertyStart("choiceThreads");
          writer.WriteObjectStart();
        }

        writer.WritePropertyStart(c.originalThreadIndex);
        c.threadAtGeneration.WriteJson(writer);
        writer.WritePropertyEnd();
      }
    }

    if (hasChoiceThreads) {
      writer.WriteObjectEnd();
      writer.WritePropertyEnd();
    }

    writer.WriteProperty("currentChoices", (w) => {
      w.WriteArrayStart();
      for (let c of this.currentChoices) {
        JsonSerialisation.WriteChoice(w, c);
      }
      w.WriteArrayEnd();
    });

    writer.WriteObjectEnd();
  }

  public LoadFlowChoiceThreads(
    jChoiceThreads: Record<string, any>,
    story: Story,
  ) {
    for (let choice of this.currentChoices) {
      let foundActiveThread = this.callStack.ThreadWithIndex(
        choice.originalThreadIndex,
      );
      if (foundActiveThread !== null) {
        choice.threadAtGeneration = foundActiveThread!.Copy();
      } else {
        let jSavedChoiceThread =
          jChoiceThreads[`${choice.originalThreadIndex}`];
        choice.threadAtGeneration = new CallStack.Thread(
          jSavedChoiceThread,
          story,
        );
      }
    }
  }
}

// What a continue cut off to start the next one: the output past the cut,
// whether that output's own line still waits for its newline (it may end with
// a caption of its own), and the content paths the cut step ran, which belong
// to the step that shows its output.
export interface CarriedStep {
  output: InkObject[];
  lineEndPending: boolean;
  paths: string[];
}
