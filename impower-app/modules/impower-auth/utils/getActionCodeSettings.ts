import { ActionCodeSettings } from "../types/aliases";

const getActionCodeSettings = (
  queries: {
    [id: string]: string;
  } = {}
): ActionCodeSettings => {
  const queryStrings = Object.entries(queries).map((kvp) => {
    const [key, value] = kvp;
    return `${key}=${value}`;
  });
  return {
    url: `${window.location.origin}/confirm?${queryStrings.join("&")}`,
  };
};

export default getActionCodeSettings;
