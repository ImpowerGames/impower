import { Toast } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import { dismissSnackbar, snackbar, type Snackbar } from "../../utils/snackbar";

export default function SnackbarHost() {
  const current = useComputed(() => snackbar.value).value;
  const [shown, setShown] = useState<Snackbar | null>(current);
  useEffect(() => {
    if (current) {
      setShown(current);
    }
  }, [current]);

  if (!shown) {
    return null;
  }

  return (
    <Toast
      open={!!current}
      message={shown.message}
      wrap={shown.persistent}
      actionLabel={shown.actionLabel}
      onAction={() => {
        shown.onAction?.();
        if (!shown.persistent) {
          dismissSnackbar(shown);
        }
      }}
      onDismiss={() => dismissSnackbar(shown)}
    />
  );
}
