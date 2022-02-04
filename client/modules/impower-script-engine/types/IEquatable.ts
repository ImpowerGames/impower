interface IEquatable {
  Equals?: (obj: unknown) => boolean;
}

export function isEquatable(obj: unknown): obj is IEquatable {
  const equatable = obj as IEquatable;
  return (
    typeof equatable === "object" && typeof equatable.Equals === "function"
  );
}
