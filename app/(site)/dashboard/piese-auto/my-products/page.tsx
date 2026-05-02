import { Suspense } from "react";
import { PieseAutoMyProductsClient } from "./PieseAutoMyProductsClient";

function PieseAutoMyProductsFallback() {
  return (
    <div className="rounded-xl p-6 bg-white border border-gray-200 dark:bg-gray-800/80 dark:border-gray-700">
      <p className="text-sm text-gray-600 dark:text-gray-300">Se încarcă…</p>
    </div>
  );
}

export default function PieseAutoMyProductsPage() {
  return (
    <Suspense fallback={<PieseAutoMyProductsFallback />}>
      <PieseAutoMyProductsClient />
    </Suspense>
  );
}
