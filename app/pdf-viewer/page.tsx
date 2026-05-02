"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";

const PdfDocViewer = dynamic(() => import("./PdfDocViewer"), { ssr: false });

function isValidLocalPdfPath(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//");
}

function PdfViewerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawUrl = (searchParams.get("url") || "").trim();
  const normalizedUrl = rawUrl === "/cerere-participare-licitatie.pdf" ? "/insolventa.pdf" : rawUrl;
  const rawFilename = (searchParams.get("filename") || "document.pdf").trim();
  const safeFilename = rawFilename.endsWith(".pdf") ? rawFilename : `${rawFilename}.pdf`;
  const isExternal = /^https?:\/\//i.test(normalizedUrl);
  const isLocal = isValidLocalPdfPath(normalizedUrl);
  const canRender = isExternal || isLocal;

  /* Layout depends on searchParams only after mount so server and client first paint match. */
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);
  const isEmbedded = hasMounted ? searchParams.get("embedded") === "1" : true;
  const embeddedLayout = isEmbedded;

  const [viewerError, setViewerError] = useState<string | null>(null);

  const { viewSrc, downloadHref, docUri } = useMemo(() => {
    if (!canRender) {
      return { viewSrc: "", downloadHref: "", docUri: "" };
    }

    if (isExternal) {
      const encodedUrl = encodeURIComponent(normalizedUrl);
      const encodedFilename = encodeURIComponent(safeFilename);
      const view = `/api/download-pdf?url=${encodedUrl}&filename=${encodedFilename}&mode=view`;
      return {
        viewSrc: view,
        downloadHref: `/api/download-pdf?url=${encodedUrl}&filename=${encodedFilename}&mode=download`,
        docUri: typeof window !== "undefined" ? `${window.location.origin}${view}` : view,
      };
    }

    const localSrc = normalizedUrl;
    return {
      viewSrc: localSrc,
      downloadHref: localSrc,
      docUri: typeof window !== "undefined" ? `${window.location.origin}${localSrc}` : localSrc,
    };
  }, [canRender, isExternal, normalizedUrl, safeFilename]);

  const documents = useMemo(() => {
    if (!docUri) return [];
    return [{ uri: docUri, fileType: "pdf" as const }];
  }, [docUri]);

  const handleBack = () => {
    if (typeof window !== "undefined" && window.self !== window.top) {
      window.parent.postMessage({ type: "closePdfModal" }, "*");
      return;
    }
    router.back();
  };

  return (
    <div
      className={
        embeddedLayout
          ? "min-h-full bg-gray-50"
          : "min-h-screen bg-gray-50"
      }
    >
      {!embeddedLayout && (
        <div className="sticky top-0 z-20 border-b border-gray-200 bg-white shadow-sm">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3">
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
              aria-label="Înapoi"
              title="Înapoi"
            >
              <i className="ri-arrow-left-line text-xl" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-800">{safeFilename}</p>
            </div>
            {canRender && !isEmbedded && (
              <a
                href={downloadHref}
                download={safeFilename}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                <i className="ri-download-line text-base" />
                <span>Descarcă</span>
              </a>
            )}
          </div>
        </div>
      )}

      <div className={`mx-auto w-full max-w-5xl ${embeddedLayout ? "p-0" : "px-3 py-4"}`}>
        {!canRender ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Link PDF invalid.
          </div>
        ) : (
          <div className={embeddedLayout ? "" : "space-y-3"}>
            <div
              className={
                embeddedLayout
                  ? "min-h-[60vh] bg-white rounded-b-xl overflow-hidden"
                  : "rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden min-h-[calc(100vh-140px)]"
              }
            >
              {documents.length > 0 && (
                <PdfDocViewer
                  documents={documents}
                  downloadHref={downloadHref}
                  minHeight={embeddedLayout ? "60vh" : "calc(100vh - 140px)"}
                  onError={() => setViewerError("PDF-ul nu a putut fi afișat.")}
                />
              )}

              {viewerError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 mx-3 mt-3">
                  <p>{viewerError}</p>
                  <a
                    href={downloadHref}
                    className="mt-2 inline-flex items-center gap-2 font-semibold text-blue-600 hover:text-blue-700 underline"
                  >
                    Descarcă PDF direct
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PdfViewerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500 text-sm">Se încarcă...</div>}>
      <PdfViewerContent />
    </Suspense>
  );
}
