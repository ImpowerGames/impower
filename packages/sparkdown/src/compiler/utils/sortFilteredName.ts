export const sortFilteredName = (name: string) => {
  // The historical name is retained for callers; attributes are ordered:
  // sorting would reverse the winner when a directive sets one group twice.
  return name.split(/[:~]/).map((part) => part.trim()).join("~");
};
