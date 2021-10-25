import React, { useEffect } from "react";
import { useRouter } from "../../../impower-router";

interface RouterContextProps {
  children?: React.ReactNode;
}

const RouterContextProvider = React.memo(
  (props: RouterContextProps): JSX.Element => {
    const { children } = props;

    const router = useRouter();

    useEffect(() => {
      router.beforePopState((state) => {
        state.options.scroll = false;
        return true;
      });
    }, [router]);

    return <>{children}</>;
  }
);

export default RouterContextProvider;
