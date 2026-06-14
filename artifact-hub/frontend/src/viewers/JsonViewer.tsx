import { useTextContent } from "./useTextContent";

export function JsonViewer({ url }: { url: string }) {
  const { data, isLoading, error } = useTextContent(url, 3 * 1024 * 1024);
  if (isLoading) return <div className="p-6 text-sm text-slate-500">Loading JSON...</div>;
  if (error || !data) return <div className="p-6 text-sm text-red-700">Unable to load JSON.</div>;
  let formatted = data.text;
  try {
    formatted = JSON.stringify(JSON.parse(data.text), null, 2);
  } catch {
    formatted = data.text;
  }
  return (
    <pre className="h-full overflow-auto bg-white p-5 font-mono text-sm leading-6 text-slate-800">
      {formatted}
    </pre>
  );
}
