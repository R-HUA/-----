export function PdfViewer({ url, title }: { url: string; title: string }) {
  return <iframe className="h-full w-full border-0 bg-white" title={title} src={url} />;
}
