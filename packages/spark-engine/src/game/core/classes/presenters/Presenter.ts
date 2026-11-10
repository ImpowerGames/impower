export interface PresentOptions {
  instant?: boolean;
  preview?: boolean;
  again?: boolean;
  stage: boolean;
  choose: (index: number) => void;
}

export interface Presenter {
  record?(): void;
  present(time?: number): void;
  finish(): void;
  chose?(index: number): void;
  focus?(index: number | null): void;
}
