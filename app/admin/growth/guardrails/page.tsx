import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import GrowthCard from "../_components/GrowthCard";
import GrowthPageShell from "../_components/GrowthPageShell";
import GuardrailActions from "./GuardrailActions";

export const dynamic = "force-dynamic";

export default async function GuardrailsPage() {
  const supabase = createAdminClient();
  const [guardrailsRes, violationsRes] = await Promise.all([
    supabase.from("growth_guardrails").select("id, guardrail_type, scope, metric, min_value, max_value, action, enabled, applies_to_job_types, created_at").order("created_at", { ascending: false }),
    supabase.from("growth_guardrail_violations").select("id, guardrail_id, job_type, metric_value, decision, created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  const guardrails = (guardrailsRes.data ?? []) as Array<{
    id: string;
    guardrail_type: string;
    scope: string;
    metric: string;
    min_value: number | null;
    max_value: number | null;
    action: string;
    enabled: boolean;
    applies_to_job_types: string[] | null;
    created_at: string;
  }>;
  const violations = (violationsRes.data ?? []) as Array<{
    id: string;
    guardrail_id: string;
    job_type: string;
    metric_value: number | null;
    decision: string;
    created_at: string;
  }>;

  return (
    <GrowthPageShell
      title="Guardrails"
      description="Threshold rules pentru a preveni instabilitatea. Evaluate: google_ads_optimizer_auto_apply, pseo_*, demand_flywheel_execute, seo_flywheel_rank_opportunities."
    >
      <div className="space-y-6">
        <GrowthCard title="Guardrails" description="Metric trebuie în [min, max]. Violare trigger: allow|warn|block." accent="yellow">
        {guardrails.length === 0 ? (
          <p className="text-sm text-[#5F6368]">No guardrails defined. Insert via SQL or add a create endpoint.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[#E8EAED]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E8EAED] bg-[#F8F9FA] text-left">
                  <th className="p-2 font-medium text-[#5F6368]">type</th>
                  <th className="p-2 font-medium text-[#5F6368]">scope</th>
                  <th className="p-2 font-medium text-[#5F6368]">metric</th>
                  <th className="p-2 font-medium text-[#5F6368]">min / max</th>
                  <th className="p-2 font-medium text-[#5F6368]">action</th>
                  <th className="p-2 font-medium text-[#5F6368]">applies to</th>
                  <th className="p-2 font-medium text-[#5F6368]">status</th>
                  <th className="p-2 font-medium text-[#5F6368]">actions</th>
                </tr>
              </thead>
              <tbody>
                {guardrails.map((g) => (
                  <tr key={g.id} className="border-b border-[#E8EAED] hover:bg-[#F8F9FA]">
                    <td className="p-2 font-mono text-[#202124]">{g.guardrail_type}</td>
                    <td className="p-2 text-[#5F6368]">{g.scope}</td>
                    <td className="p-2 font-mono text-[#5F6368]">{g.metric}</td>
                    <td className="p-2 text-[#5F6368]">
                      {g.min_value != null ? g.min_value : "—"} / {g.max_value != null ? g.max_value : "—"}
                    </td>
                    <td className="p-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs ${
                        g.action === "block" ? "bg-[#FCE8E6] text-[#EA4335]" :
                        g.action === "warn" ? "bg-[#FEF7E0] text-[#FBBC04]" :
                        "bg-[#E8EAED] text-[#5F6368]"
                      }`}>{g.action}</span>
                    </td>
                    <td className="p-2 text-xs text-[#5F6368]">
                      {g.applies_to_job_types?.length ? g.applies_to_job_types.join(", ") : "all"}
                    </td>
                    <td className="p-2">
                      <span className={g.enabled ? "text-[#34A853]" : "text-[#9AA0A6]"}>
                        {g.enabled ? "On" : "Off"}
                      </span>
                    </td>
                    <td className="p-2">
                      <GuardrailActions guardrail={g} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </GrowthCard>

        <GrowthCard title="Recent Violations" description="Last 100 violations (block or warn)." accent="red">
          {violations.length === 0 ? (
            <p className="text-sm text-[#5F6368]">No violations yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[#E8EAED]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E8EAED] bg-[#F8F9FA] text-left">
                    <th className="p-2 font-medium text-[#5F6368]">job_type</th>
                    <th className="p-2 font-medium text-[#5F6368]">metric_value</th>
                    <th className="p-2 font-medium text-[#5F6368]">decision</th>
                    <th className="p-2 font-medium text-[#5F6368]">created</th>
                  </tr>
                </thead>
                <tbody>
                  {violations.map((v) => (
                    <tr key={v.id} className="border-b border-[#E8EAED] hover:bg-[#F8F9FA]">
                      <td className="p-2 font-mono text-[#202124]">{v.job_type}</td>
                      <td className="p-2 text-[#5F6368]">{v.metric_value != null ? v.metric_value : "—"}</td>
                      <td className="p-2">
                        <span className={`rounded px-1.5 py-0.5 text-xs ${
                          v.decision === "block" ? "bg-[#FCE8E6] text-[#EA4335]" : "bg-[#FEF7E0] text-[#FBBC04]"
                        }`}>{v.decision}</span>
                      </td>
                      <td className="p-2 text-[#5F6368]">{new Date(v.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GrowthCard>
      </div>
    </GrowthPageShell>
  );
}
