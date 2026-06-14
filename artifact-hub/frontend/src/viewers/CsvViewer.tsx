import Papa from "papaparse";
import { useMemo } from "react";
import { useTextContent } from "./useTextContent";

export function CsvViewer({ url }: { url: string }) {
  const { data, isLoading, error } = useTextContent(url, 4 * 1024 * 1024);
  const rows = useMemo(() => {
    if (!data?.text) return [];
    const result = Papa.parse<string[]>(data.text, { skipEmptyLines: true });
    return result.data.slice(0, 1000);
  }, [data]);
  if (isLoading) return <div className="p-6 text-sm text-slate-500">Loading CSV...</div>;
  if (error || !data) return <div className="p-6 text-sm text-red-700">Unable to load CSV.</div>;
  return (
    <div className="h-full overflow-auto bg-white p-4">
      {data.truncated ? <div className="mb-3 text-sm text-amber-800">Preview is truncated.</div> : null}
      <table className="min-w-full border-collapse text-sm">
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className={rowIndex === 0 ? "bg-slate-100 font-semibold" : ""}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="border border-slate-200 px-3 py-2 align-top">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
