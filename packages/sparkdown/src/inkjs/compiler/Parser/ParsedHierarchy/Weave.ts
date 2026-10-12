import { Choice } from "./Choice";
import { FlowBase } from "./Flow/FlowBase";
import { Gather } from "./Gather/Gather";
import type { IWeavePoint } from "./IWeavePoint";
import { ParsedObject } from "./Object";
import { Story } from "./Story";
import { asOrNull } from "../../../../runtime/TypeAssertion";
import type { ProgramEmitter } from "../../../../program/ProgramEmitter";
import { RecordingMap } from "./ResolutionTap";

// Used by the FlowBase when constructing the weave flow from
// a flat list of content objects.
export class Weave extends ParsedObject {
  // Whether the weave was prepared since its last `ResetRuntime`.
  private _rootPrepared = false;

  /** The weave prepared once, heard by no tap. */
  public prepareRoot(): void {
    if (!this._rootPrepared) {
      this.Prepare();
    }
  }

  private _structuredContent: ParsedObject[] | null = null;

  public get structuredContent() {
    if (!this._structuredContent) {
      this._structuredContent = this.ConstructWeaveHierarchyFromIndentation();
    }
    return this._structuredContent;
  }

  public baseIndentIndex: number;

  private _namedWeavePoints: Map<string, IWeavePoint> = new RecordingMap(
    () => "labels",
  );
  get namedWeavePoints() {
    return this._namedWeavePoints;
  }

  // The weave of a `choose` block, which choices offered from inside a
  // conditional or sequence within it continue at the end of.
  public isChooseBlock = false;

  // The weave of a `choose` block written in another block's preamble, which
  // offers its choices with that block's.
  public isPreambleChoose = false;

  // For the weave the compiler assembles in place of a chunk's trailing
  // weave, the chunk's own weave, whose content is what the chunk lowered;
  // the assembled one goes on to hold the content of the chunks after it.
  public assembledFrom: Weave | null = null;

  constructor(cont: ParsedObject[], indentIndex: number = -1) {
    super();

    if (indentIndex == -1) {
      this.baseIndentIndex = this.DetermineBaseIndentationFromContent(cont);
    } else {
      this.baseIndentIndex = indentIndex;
    }

    this.AddContent(cont);
  }

  override get typeName(): string {
    return "Weave";
  }

  // A weave that holds statements is their code in order. A `choose` block's
  // weave is the block itself: its choices, their entries and its `then`
  // clause (docs/engine/binary-program.md, section 4). A block written in
  // another block's preamble offers its choices with that block's and holds
  // no flow of its own: its code is part of the other block's presentation,
  // and its choices continue at its `then` clause when it has one, and
  // otherwise where the other block's do.
  public override EmitProgram(emitter: ProgramEmitter): void {
    if (this.isChooseBlock) {
      emitter.emitChoose(this);
      return;
    }
    if (
      this.isPreambleChoose ||
      this.content.some((obj) => obj instanceof Choice)
    ) {
      emitter.emitPreambleChoose(this);
      return;
    }
    emitter.emitObjects(this.content);
  }

  public readonly ResolveWeavePointNaming = (): void => {
    this.NameWeavePoints([
      ...this.FindAll<IWeavePoint>(Gather)(
        (w) => !(w.name === null || w.name === undefined),
      ),
      ...this.FindAll<IWeavePoint>(Choice)(
        (w) => !(w.name === null || w.name === undefined),
      ),
    ]);
  };

  /** Names the weave's points: every named gather the weave holds at any
   *  depth, then every named choice, each in the order the weave holds it,
   *  reporting a label named twice. The program path's resolver passes them
   *  from what each statement of the weave recorded, so that it does not
   *  walk the statements it does not resolve again. */
  public readonly NameWeavePoints = (namedWeavePoints: IWeavePoint[]): void => {
    this._namedWeavePoints = new RecordingMap(() => "labels");

    for (const weavePoint of namedWeavePoints) {
      // Check for weave point naming collisions
      const existingWeavePoint: IWeavePoint | null | undefined =
        this.namedWeavePoints.get(weavePoint.identifier?.name || "");

      if (existingWeavePoint) {
        const typeName =
          existingWeavePoint instanceof Gather ? "gather" : "choice";
        const existingObj: ParsedObject = existingWeavePoint;

        this.Error(
          `A ${typeName} with the same label name \`${weavePoint.name}\` already exists on ${existingObj.debugMetadata}`,
          weavePoint.identifier,
        );
      }
      if (weavePoint.identifier?.name) {
        this.namedWeavePoints.set(weavePoint.identifier?.name, weavePoint);
      }
    }
  };

  public readonly ConstructWeaveHierarchyFromIndentation =
    (): ParsedObject[] => {
      // Find nested indentation and convert to a proper object hierarchy
      // (i.e. indented content is replaced with a Weave object that contains
      // that nested content)
      const structuredContent = [...this.content];
      let contentIdx = 0;
      while (contentIdx < structuredContent.length) {
        const obj: ParsedObject = structuredContent[contentIdx]!;

        // Choice or Gather
        if (obj instanceof Choice || obj instanceof Gather) {
          const weavePoint: IWeavePoint = obj;
          const weaveIndentIdx = weavePoint.indentationDepth - 1;

          // Inner level indentation - recurse
          if (weaveIndentIdx > this.baseIndentIndex) {
            // Step through content until indent jumps out again
            let innerWeaveStartIdx = contentIdx;
            while (contentIdx < structuredContent.length) {
              const innerWeaveObj =
                asOrNull(structuredContent[contentIdx], Choice) ||
                asOrNull(structuredContent[contentIdx], Gather);
              if (innerWeaveObj !== null) {
                const innerIndentIdx = innerWeaveObj.indentationDepth - 1;
                if (innerIndentIdx <= this.baseIndentIndex) {
                  break;
                }
              }

              contentIdx += 1;
            }

            const weaveContentCount = contentIdx - innerWeaveStartIdx;
            const weaveContent = structuredContent.slice(
              innerWeaveStartIdx,
              innerWeaveStartIdx + weaveContentCount,
            );

            structuredContent.splice(innerWeaveStartIdx, weaveContentCount);

            const weave = new Weave(weaveContent, weaveIndentIdx);
            weave.parent = this;
            structuredContent.splice(innerWeaveStartIdx, 0, weave);

            // Continue iteration from this point
            contentIdx = innerWeaveStartIdx;
          }
        }

        contentIdx += 1;
      }
      return structuredContent;
    };

  // When the indentation wasn't told to us at construction time using
  // a choice point with a known indentation level, we may be told to
  // determine the indentation level by incrementing from our closest ancestor.
  public readonly DetermineBaseIndentationFromContent = (
    contentList: ParsedObject[],
  ): number => {
    for (const obj of contentList) {
      if (obj instanceof Choice || obj instanceof Gather) {
        return obj.indentationDepth - 1;
      }
    }

    // No weave points, so it doesn't matter
    return 0;
  };

  /** Each object of the weave's hierarchy prepared in its order, a gather
   *  and a choice as weave points, a nested weave as its root, and anything
   *  else as itself. */
  protected override Prepare(): boolean {
    this._rootPrepared = true;
    for (const obj of this.structuredContent) {
      if (obj instanceof Choice || obj instanceof Gather) {
        obj.prepare();
      } else if (obj instanceof Weave) {
        obj.prepareRoot();
      } else {
        obj.prepare();
      }
    }
    return true;
  }

  public override ResolveWith(context: Story): void {
    this.CheckForWeavePointNamingCollisions();

    super.ResolveWith(context);
  }

  public readonly WeavePointNamed = (name: string): IWeavePoint | null => {
    if (!this.namedWeavePoints) {
      return null;
    }

    let weavePointResult: IWeavePoint | null | undefined =
      this.namedWeavePoints.get(name);
    if (weavePointResult) {
      return weavePointResult;
    }

    return null;
  };

  // Enforce rule that weave points must not have the same
  // name as any stitches or knots upwards in the hierarchy
  public readonly CheckForWeavePointNamingCollisions = (): void => {
    if (!this.namedWeavePoints) {
      return;
    }

    const ancestorFlows = [];
    for (const obj of this.ancestry) {
      const flow = asOrNull(obj, FlowBase);
      if (flow) {
        ancestorFlows.push(flow);
      } else {
        break;
      }
    }

    for (const [weavePointName, weavePoint] of this.namedWeavePoints) {
      for (const flow of ancestorFlows) {
        // Shallow search
        const otherContentWithName =
          flow.ContentWithNameAtLevel(weavePointName);
        if (otherContentWithName && otherContentWithName !== weavePoint) {
          const errorMsg = `Duplicate identifier \`${weavePointName}\`. A ${otherContentWithName
            .GetType()
            .toLowerCase()} named \`${weavePointName}\` already exists on ${
            otherContentWithName.debugMetadata
          }`;
          this.Error(errorMsg, weavePoint?.identifier || weavePoint);
        }
      }
    }
  };

  override OnResetRuntime(): void {
    this._rootPrepared = false;
    // The hierarchy holds weaves built from `content` that a reset walk over
    // `content` never reaches, each keeping that it was prepared, so the next
    // preparation builds the hierarchy again.
    this._structuredContent = null;
  }
}
