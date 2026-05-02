import GrowthCard from "../../_components/GrowthCard";
import GrowthPageShell from "../../_components/GrowthPageShell";
import ActionButton from "../../_components/ActionButton";
import JobRunsTable from "../../_components/JobRunsTable";

export default function GrowthSitemapsPage() {
  return (
    <GrowthPageShell
      title="SEO Sitemaps"
      description="Ping sitemap și istoric rulări."
    >
      <div className="space-y-6">
        <GrowthCard
          title="Ping Sitemap"
          description="Enqueuează un job care face ping la URL-ul sitemap-ului."
          accent="blue"
        >
          <ActionButton
            label="Enqueue ping sitemap"
            href="/api/admin/growth/seo/sitemaps/ping"
            method="POST"
            body={{ sitemapUrl: "https://gobid.ro/sitemap.xml" }}
          />
        </GrowthCard>

        <GrowthCard title="Istoric rulări" description="Ultimele rulări pentru job-uri sitemap." accent="slate">
          <JobRunsTable limit={15} theme="slate" />
        </GrowthCard>
      </div>
    </GrowthPageShell>
  );
}
