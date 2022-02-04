export class DebugMetadata {
  public startLineNumber = 0;

  public endLineNumber = 0;

  public startCharacterNumber = 0;

  public endCharacterNumber = 0;

  public fileName: string = null;

  public sourceName: string = null;

  public Merge(dm: DebugMetadata): DebugMetadata {
    const newDebugMetadata = new DebugMetadata();

    newDebugMetadata.fileName = this.fileName;
    newDebugMetadata.sourceName = this.sourceName;

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

  public toString(): string {
    if (this.fileName !== null) {
      return `line ${this.startLineNumber} of ${this.fileName}"`;
    }
    return `line ${this.startLineNumber}`;
  }
}
