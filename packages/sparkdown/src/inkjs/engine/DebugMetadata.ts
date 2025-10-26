export class DebugMetadata {
  public startLineNumber: number = 0;
  public endLineNumber: number = 0;
  public startCharacterNumber: number = 0;
  public endCharacterNumber: number = 0;
  public fileName: string | null = null;
  public filePath: string | null = null;
  public adjusted?: boolean;

  constructor(dm?: DebugMetadata) {
    if (dm) {
      this.startLineNumber = dm.startLineNumber;
      this.endLineNumber = dm.endLineNumber;
      this.startCharacterNumber = dm.startCharacterNumber;
      this.endCharacterNumber = dm.endCharacterNumber;
      this.fileName = dm.fileName;
      this.filePath = dm.filePath;
    }
  }

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
        dm.startCharacterNumber
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
        dm.endCharacterNumber
      );
    }

    return newDebugMetadata;
  }

  public toString() {
    if (this.fileName !== null) {
      const name = this.fileName.split(".")[0] || this.fileName;
      return `line ${this.startLineNumber} of '${name}'`;
    } else {
      return "line " + this.startLineNumber;
    }
  }
}
