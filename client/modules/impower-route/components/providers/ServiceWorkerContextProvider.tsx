import React from "react";
import {
  ServiceWorkerContext,
  useServiceWorkerContextState,
} from "../../../impower-pwa";

interface ServiceWorkerContextProviderProps {
  children?: React.ReactNode;
}

const ServiceWorkerContextProvider = React.memo(
  (props: ServiceWorkerContextProviderProps): JSX.Element => {
    const { children } = props;

    const serviceWorkerContext = useServiceWorkerContextState({
      swPath: "/sw.js",
    });

    return (
      <ServiceWorkerContext.Provider value={serviceWorkerContext}>
        {children}
      </ServiceWorkerContext.Provider>
    );
  }
);

export default ServiceWorkerContextProvider;
