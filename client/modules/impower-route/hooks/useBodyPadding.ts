import { useCallback, useState } from "react";
import { useMutationObserver } from "./useMutationObserver";

const mutationObserverOptions = {
  attributes: true,
  attributeFilter: ["style"],
};

export const useBodyPadding = (): string => {
  const documentBody =
    typeof document !== "undefined" ? document.body : undefined;
  const [bodyPadding, setBodyPadding] = useState<string>(
    documentBody ? documentBody.style.paddingRight : undefined
  );

  const handleMutateHtml = useCallback(() => {
    if (documentBody) {
      const bodyPadding = documentBody.style.paddingRight;
      setBodyPadding(bodyPadding);
    }
  }, [documentBody]);

  useMutationObserver(documentBody, handleMutateHtml, mutationObserverOptions);

  return bodyPadding;
};
