export const sortFilteredName = (name: string) => {
  return name.split(/[:~]/).map((part) => part.trim()).join("~");
};
