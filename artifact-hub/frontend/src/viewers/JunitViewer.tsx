import { useMemo } from "react";
import { useTextContent } from "./useTextContent";

type CaseRow = { name: string; classname: string; time: string; failure?: string };

export function JunitViewer({ url }: { url: string }) {
  const { data, isLoading, error } = useTextContent(url, 4 * 1024 * 1024);
  const parsed = useMemo(() => parseJunit(data?.text || ""), [data]);
  if (isLoading) return <div className="p-6 text-sm text-slate-500">Loading JUnit report...</div>;
  if (error || !data) return <div className="p-6 text-sm text-red-700">Unable to load JUnit report.</div>;
  return (
    <div className="h-full overflow-auto bg-white p-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Tests" value={parsed.tests} />
        <Metric label="Failures" value={parsed.failures} tone={parsed.failures > 0 ? "bad" : "good"} />
        <Metric label="Errors" value={parsed.errors} tone={parsed.errors > 0 ? "bad" : "good"} />
        <Metric label="Skipped" value={parsed.skipped} />
      </div>
      <table className="mt-5 min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-100 text-left">
            <th className="border border-slate-200 px-3 py-2">Class</th>
            <th className="border border-slate-200 px-3 py-2">Name</th>
            <th className="border border-slate-200 px-3 py-2">Time</th>
            <th className="border border-slate-200 px-3 py-2">Failure</th>
          </tr>
        </thead>
        <tbody>
          {parsed.cases.map((row, index) => (
            <tr key={index}>
              <td className="border border-slate-200 px-3 py-2">{row.classname}</td>
              <td className="border border-slate-200 px-3 py-2">{row.name}</td>
              <td className="border border-slate-200 px-3 py-2">{row.time}</td>
              <td className="border border-slate-200 px-3 py-2 text-red-700">{row.failure}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "good" | "bad" }) {
  const toneClass = tone === "bad" ? "text-red-700" : tone === "good" ? "text-emerald-700" : "text-slate-800";
  return (
    <div className="border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function parseJunit(text: string): { tests: number; failures: number; errors: number; skipped: number; cases: CaseRow[] } {
  if (!text) return { tests: 0, failures: 0, errors: 0, skipped: 0, cases: [] };
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const suites = Array.from(doc.querySelectorAll("testsuite"));
  const root = suites[0] || doc.documentElement;
  const cases = Array.from(doc.querySelectorAll("testcase")).slice(0, 1000).map((node) => ({
    name: node.getAttribute("name") || "",
    classname: node.getAttribute("classname") || "",
    time: node.getAttribute("time") || "",
    failure: node.querySelector("failure,error")?.textContent?.trim()
  }));
  return {
    tests: Number(root.getAttribute("tests") || cases.length || 0),
    failures: Number(root.getAttribute("failures") || 0),
    errors: Number(root.getAttribute("errors") || 0),
    skipped: Number(root.getAttribute("skipped") || 0),
    cases
  };
}
