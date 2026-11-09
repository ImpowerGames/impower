export interface PresentOptions {
  instant?: boolean;
  preview?: boolean;
  choose: (index: number) => void;
}

export interface Presenter {
  present(time?: number): void;
  finish(): void;
}
