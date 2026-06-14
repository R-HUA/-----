import type { ViewArtifact } from "../types";
import { BinaryViewer } from "./BinaryViewer";
import { CsvViewer } from "./CsvViewer";
import { HtmlViewer } from "./HtmlViewer";
import { ImageViewer } from "./ImageViewer";
import { JsonViewer } from "./JsonViewer";
import { JunitViewer } from "./JunitViewer";
import { MarkdownViewer } from "./MarkdownViewer";
import { PdfViewer } from "./PdfViewer";
import { TextViewer } from "./TextViewer";

export function ArtifactViewer({ artifact }: { artifact: ViewArtifact }) {
  switch (artifact.kind) {
    case "markdown":
      return <MarkdownViewer url={artifact.contentUrl} downloadUrl={artifact.downloadUrl} />;
    case "html":
    case "html-bundle":
      return <HtmlViewer url={artifact.contentUrl} title={artifact.title} />;
    case "image":
      return <ImageViewer url={artifact.contentUrl} title={artifact.title} />;
    case "svg":
      return <ImageViewer url={artifact.contentUrl} title={artifact.title} svg />;
    case "pdf":
      return <PdfViewer url={artifact.contentUrl} title={artifact.title} />;
    case "json":
      return <JsonViewer url={artifact.contentUrl} />;
    case "csv":
      return <CsvViewer url={artifact.contentUrl} />;
    case "text":
      return <TextViewer url={artifact.contentUrl} downloadUrl={artifact.downloadUrl} />;
    case "junit":
      return <JunitViewer url={artifact.contentUrl} />;
    default:
      return <BinaryViewer filename={artifact.filename} kind={artifact.kind} sizeBytes={artifact.sizeBytes} downloadUrl={artifact.downloadUrl} />;
  }
}
