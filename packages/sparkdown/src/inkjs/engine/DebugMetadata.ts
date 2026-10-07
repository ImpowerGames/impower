import { activation } from "./StoryActivation";

export class DebugMetadata {
  /** The compile generation this metadata was created in (`activation`). */
  public readonly _birth: number = activation.generation;
  /** A runtime object has held this metadata, so a story can hold it. */
  public _heldAtRuntime = false;
  public startLineNumber: number = 0;
  public endLineNumber: number = 0;
  public startCharacterNumber: number = 0;
  public endCharacterNumber: number = 0;
  public fileName: string | null = null;
  public filePath: string | null = null;
  public sourceStartLineNumber?: number;
  public sourceEndLineNumber?: number;
  public version?: number;

  constructor(dm?: DebugMetadata) {
    if (dm) {
      this.startLineNumber = dm.startLineNumber;
      this.endLineNumber = dm.endLineNumber;
      this.startCharacterNumber = dm.startCharacterNumber;
      this.endCharacterNumber = dm.endCharacterNumber;
      this.fileName = dm.fileName;
      this.filePath = dm.filePath;
    }
    DebugMetadata.onCreated?.(this);
  }

  /** Hears each position made, so that the program path's resolver tells a
   *  position a diagnostic made apart from a parsed object's, which an edit
   *  moves in place. */
  public static onCreated: ((metadata: DebugMetadata) => void) | null = null;

  public Merge(dm: DebugMetadata) {
    let newDebugMetadata = new DebugMetadata();

    newDebugMetadata.fileName = this.fileName;
    newDebugMetadata.filePath = this.filePath;

    if (this.startLineNumber < dm.startLineNumber) {
      newDebugMetadata.startLineNumber = this.startLineNumber;
      newDebugMetadata.startCharacterNumber = this.startCharacterNumber;
    } else if (this.startLineNumber > dm.startLineNumber) {
      newDebugMetadata.startLineNumber = dm.startLineNumber;
      newDebugMetadata.startCharacterNumber = dm.startCharacterNumber;
    } else {
      newDebugMetadata.startLineNumber = this.startLineNumber;
      newDebugMetadata.startCharacterNumber = Math.min(
        this.startCharacterNumber,
        dm.startCharacterNumber,
      );
    }

    if (this.endLineNumber > dm.endLineNumber) {
      newDebugMetadata.endLineNumber = this.endLineNumber;
      newDebugMetadata.endCharacterNumber = this.endCharacterNumber;
    } else if (this.endLineNumber < dm.endLineNumber) {
      newDebugMetadata.endLineNumber = dm.endLineNumber;
      newDebugMetadata.endCharacterNumber = dm.endCharacterNumber;
    } else {
      newDebugMetadata.endLineNumber = this.endLineNumber;
      newDebugMetadata.endCharacterNumber = Math.max(
        this.endCharacterNumber,
        dm.endCharacterNumber,
      );
    }

    return newDebugMetadata;
  }

  /** Hears each position printed into a message: the program path's
   *  resolver records the positions a statement's diagnostics print, which
   *  an edit above them moves (`ResolutionTap.position`). */
  public static onPrinted: ((metadata: DebugMetadata, printed: string) => void) | null =
    null;

  public toString() {
    let printed: string;
    if (this.fileName !== null) {
      const name = this.fileName.split(".")[0] || this.fileName;
      printed = `line ${this.startLineNumber} of '${name}'`;
    } else {
      printed = "line " + this.startLineNumber;
    }
    DebugMetadata.onPrinted?.(this, printed);
    return printed;
  }
}
