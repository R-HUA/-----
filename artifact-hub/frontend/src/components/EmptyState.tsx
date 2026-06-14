export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center border border-dashed border-slate-300 bg-white p-8 text-center">
      <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
      {detail ? <p className="mt-2 max-w-lg text-sm text-slate-500">{detail}</p> : null}
    </div>
  );
}
