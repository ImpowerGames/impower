import Button from "@material-ui/core/Button";
import { LoadingButtonProps } from "@material-ui/lab";
import dynamic from "next/dynamic";
import { createContext, useContext } from "react";

const LoadingContext = createContext<LoadingButtonProps>({});

const ContextualPlaceholder = (): JSX.Element => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { loading, ...other } = useContext(LoadingContext);
  return <Button {...other} />;
};

const LoadingButton = dynamic(() => import("@material-ui/lab/LoadingButton"), {
  ssr: false,
  loading: () => <ContextualPlaceholder />,
});

const DynamicLoadingButton = (
  props: LoadingButtonProps
): JSX.Element | null => {
  return (
    <LoadingContext.Provider value={props}>
      {props.loading ? <LoadingButton {...props} /> : <ContextualPlaceholder />}
    </LoadingContext.Provider>
  );
};

export default DynamicLoadingButton;
