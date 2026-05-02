"use client";

import { useState } from "react";
import Card from "../../_components/Card";
import ActionButton from "../../_components/ActionButton";
import JobRunsTable from "../../_components/JobRunsTable";
import GrowthPageShell from "../../_components/GrowthPageShell";

export default function GrowthIndexingPage() {
  const [urlsText, setUrlsText] = useState("");

  const urls = urlsText
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <GrowthPageShell
      title="Indexing"
      description="Enqueue index request și istoric rulări pentru SEO."
    >
      <div className="space-y-6">
      <Card
        title="Enqueue index request"
        description="Trimite o listă de URL-uri pentru job-ul seo_index_request."
        accent="blue"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              URL-uri (câte unul per linie)
            </label>
            <textarea
              value={urlsText}
              onChange={(e) => setUrlsText(e.target.value)}
              placeholder="https://gobid.ro/ro/..."
              rows={5}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <ActionButton
            label="Enqueue job"
            href="/api/admin/growth/seo/indexing/enqueue"
            method="POST"
            body={{ urls }}
          />
        </div>
      </Card>

      <Card title="Istoric rulări" accent="slate">
        <JobRunsTable limit={15} theme="slate" />
      </Card>
      </div>
    </GrowthPageShell>
  );
}
