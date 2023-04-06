import Head from "next/head";
import React from "react";

export const DarkModeOnlyHead = React.memo((): JSX.Element => {
  return (
    <Head>
      <meta name="color-scheme" content="dark only" />
    </Head>
  );
});

export default DarkModeOnlyHead;
