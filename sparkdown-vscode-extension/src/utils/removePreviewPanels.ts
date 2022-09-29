import { previewState } from "../state/previewState";

export const removePreviewPanel = (type: "screenplay" | "game", id: number) => {
  for (let i = previewState[type].length - 1; i >= 0; i--) {
    if (previewState[type][i].id === id) {
      previewState[type].splice(i, 1);
    }
  }
};
