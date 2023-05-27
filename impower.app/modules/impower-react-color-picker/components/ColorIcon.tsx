import React from "react";

interface ColorIconProps {
  name: string;
}

export const ColorIcon = React.memo((props: ColorIconProps): JSX.Element => {
  const { name } = props;
  const getPath = (p: string): JSX.Element => {
    switch (p) {
      case "check":
        return (
          <>
            <path d="M2.2326 30.1008l3.7139-5.9333L23.072 34.8882l19.2522-30.41 5.914 3.744-23.001 36.3315-5.914-3.744.0037-.0067z" />
          </>
        );
      case "cross":
        return (
          <>
            <path
              d="M34.3656 3.0593000000000004A24.084 24.084 0 1 0 15.166 47.2354 24.084 24.084 0 1 0 34.3656 3.0593zM32.0123 8.474a18.18 18.18 0 0 1-14.493 33.3467A18.18 18.18 0 0 1 32.0123 8.474z"
              fill="#dfdfdf"
            />
            <path
              d="M36.7852 11.4797A18.168 18.168 0 1 0 12.8026 38.777a18.168 18.168 0 1 0 23.9826-27.2973zM33.6263 15.0752a13.382 13.382 0 0 1-17.6649 20.1063 13.382 13.382 0 0 1 17.6649-20.1063z"
              fill="#363636"
            />
          </>
        );
      case "handle":
        return (
          <>
            <path
              d="M34.736998 0v49.921h-5.578V0zm-16.737 49.921V0h5.578v49.921z"
              fill="#dfdfdf"
            />
            <path
              fill="#363636"
              d="M31.371873.078V50h-2.316V.078zM23.470873 0v49.922h-2.316V0z"
            />
          </>
        );

      default:
        throw new Error("must provide a name prop to Svg");
    }
  };

  return (
    <svg
      viewBox="0 0 50 50"
      preserveAspectRatio="none meet"
      xmlns="http://www.w3.org/2000/svg"
    >
      {getPath(name)}
    </svg>
  );
});
