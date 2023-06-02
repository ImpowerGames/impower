import { useCallback, useEffect } from "react";

export const useBodyPaddingCallback = (
  attr: "paddingRight" | "right" | "marginRight" | "width" = "paddingRight",
  getPaddedValue: (bodyPadding: string) => string = (
    bodyPadding: string
  ): string => bodyPadding,
  getUnpaddedValue: () => string = (): string => `0`,
  ...elements: HTMLElement[]
): void => {
  const documentBody =
    typeof document !== "undefined" ? document.body : undefined;

  const handleMutateHtml = useCallback(() => {
    if (elements && documentBody) {
      const bodyPadding = documentBody.style.paddingRight || "0";
      const isBodyPadded =
        bodyPadding !== undefined &&
        bodyPadding !== null &&
        bodyPadding !== "" &&
        bodyPadding !== "0" &&
        bodyPadding !== "0px";
      if (isBodyPadded) {
        if (elements) {
          elements.forEach((el) => {
            if (el) {
              el.style[attr] = getPaddedValue(bodyPadding);
            }
          });
        }
      } else {
        elements.forEach((el) => {
          if (el) {
            el.style[attr] = `${getUnpaddedValue()}`;
          }
        });
      }
    }
  }, [attr, documentBody, elements, getPaddedValue, getUnpaddedValue]);

  useEffect(() => {
    if (!documentBody) {
      return (): void => null;
    }

    const observer = new MutationObserver(handleMutateHtml);
    observer.observe(documentBody, {
      attributes: true,
    });

    handleMutateHtml();

    return (): void => {
      observer.disconnect();
    };
  }, [documentBody, handleMutateHtml]);
};
