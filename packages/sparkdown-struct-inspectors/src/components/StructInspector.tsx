import { useCallback, useEffect, useState } from "preact/hooks";
import SynthInspector from "./synth/component/SynthInspector";

export interface StructInspectorProps {
  value?: any;
  onInput?: (value: any) => void;
  onChange?: (value: any) => void;
}

export default function StructInspector({
  value,
  onInput,
  onChange,
}: StructInspectorProps) {
  const [struct, setStruct] = useState<any>(value);

  const handleInput = useCallback((value: any) => {
    setStruct(value);
    onInput?.(value);
  }, []);

  const handleChange = useCallback((value: any) => {
    setStruct(value);
    onChange?.(value);
  }, []);

  useEffect(() => {
    setStruct(value);
  }, [value]);

  if (!struct) {
    return <div></div>;
  }

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden select-none">
      {struct.$type === "synth" && (
        <SynthInspector
          value={struct}
          onInput={handleInput}
          onChange={handleChange}
        />
      )}
    </div>
  );
}
