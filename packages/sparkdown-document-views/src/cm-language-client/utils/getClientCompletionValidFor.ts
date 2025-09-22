export const getClientCompletionValidFor = (
  triggerCharacters: string[] | undefined
) => {
  const chars = triggerCharacters
    ? triggerCharacters
        .filter((c) => c !== "\n" && c !== "\r")
        .join("")
        .replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")
    : "";
  return new RegExp(`[^${chars}]*$`);
};
