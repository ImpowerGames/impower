import { default_synth } from "@impower/spark-engine/src/game/modules/audio/constructors/default_synth";
import { useCallback, useState } from "preact/hooks";
import StructInspector from "./components/StructInspector";

const DEFAULT_JSON: Record<string, any> = default_synth();

export function App() {
  const [rawText, setRawText] = useState<string>(
    JSON.stringify(DEFAULT_JSON, null, 2),
  );
  const [parsedData, setParsedData] = useState<any>(DEFAULT_JSON);
  const [error, setError] = useState<string | null>(null);

  const handleRawTextChange = (e: Event) => {
    const newVal = (e.target as HTMLInputElement).value;
    setRawText(newVal);
    try {
      const parsed = JSON.parse(newVal);
      setParsedData(parsed);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Invalid JSON format");
    }
  };

  const handleInput = useCallback((value: any) => {
    setParsedData(value);
    setRawText(JSON.stringify(value, null, 2));
  }, []);

  const handleChange = useCallback((value: any) => {
    setParsedData(value);
    setRawText(JSON.stringify(value, null, 2));
  }, []);

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-gray-50 text-gray-800 font-sans overflow-hidden">
      {/* LEFT PANE: Raw JSON Editor */}
      <div className="w-full md:w-1/2 flex flex-col h-[50vh] md:h-full border-b md:border-b-0 md:border-r border-neutral-700 bg-white shadow-sm z-10">
        {/* Text Area */}
        <div className="flex-1 relative">
          <textarea
            value={rawText}
            onChange={handleRawTextChange}
            spellcheck={false}
            className="absolute inset-0 w-full h-full p-4 font-mono text-sm bg-[#1e1e1e] text-[#d4d4d4] resize-none focus:outline-none focus:ring-inset focus:ring-2 focus:ring-blue-500/50 scrollbar-thin scrollbar-thumb-neutral-600 scrollbar-track-neutral-800"
            placeholder="Paste your JSON here..."
          />
          {error && (
            <div className="absolute bottom-0 left-0 right-0 bg-red-600/90 text-white text-xs p-3 font-mono border-t border-red-700 backdrop-blur-sm">
              <span className="font-bold">Error parsing JSON:</span> {error}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANE: Visual Editor */}
      <div className="w-full md:w-1/2 flex flex-col h-[50vh] md:h-full bg-white">
        <StructInspector
          value={parsedData}
          onInput={handleInput}
          onChange={handleChange}
        />
      </div>
    </div>
  );
}
