"use client";

import DocViewer, { DocViewerRenderers } from "@cyntler/react-doc-viewer";
import "react-pdf/dist/esm/Page/TextLayer.css";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "./pdf-viewer.css";

export interface PdfDocViewerProps {
  documents: { uri: string; fileType: "pdf" }[];
  downloadHref: string;
  minHeight?: string;
  onError?: () => void;
}

export default function PdfDocViewer({
  documents,
  downloadHref,
  minHeight = "60vh",
  onError,
}: PdfDocViewerProps) {
  return (
    <div className="gobid-pdf-viewer w-full bg-white rounded-xl border border-gray-200" style={{ minHeight }}>
      <DocViewer
        documents={documents}
        pluginRenderers={DocViewerRenderers}
        className="gobid-pdf-viewer"
        config={{
          header: {
            disableHeader: true,
          },
          loadingRenderer: {
            overrideComponent: () => (
              <div className="flex items-center justify-center p-10 min-h-[200px] text-gray-500 text-sm font-medium">
                Se încarcă documentul...
              </div>
            ),
          },
          noRenderer: {
            overrideComponent: () => (
              <div className="p-6 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm">
                Acest PDF nu a putut fi afișat.{" "}
                <a href={downloadHref} className="font-semibold text-blue-600 hover:text-blue-700 underline">
                  Descarcă PDF
                </a>
              </div>
            ),
          },
        }}
      />
    </div>
  );
}
