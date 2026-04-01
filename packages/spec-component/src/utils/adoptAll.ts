import { Styles } from "../caches/Styles";

export const adoptAll = (styles: Record<string, string>): void => {
  Object.entries(styles).forEach(([name, cssText]) => {
    Styles.adoptStyle(document, name, cssText);
  });
};
