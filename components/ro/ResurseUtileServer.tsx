import { getAppliedInternalLinksForSource } from "@/lib/growth/internalLinks";

export default async function ResurseUtileServer({ sourcePath }: { sourcePath: string }) {
  const links = await getAppliedInternalLinksForSource(sourcePath);
  if (links.length === 0) return null;
  return (
    <section
      className="mt-6 px-4 py-4 rounded-lg bg-slate-100/80 border border-slate-200"
      aria-label="Resurse utile"
    >
      <h2 className="text-lg font-semibold text-slate-900">Resurse utile</h2>
      <ul className="mt-2 space-y-1">
        {links.map((link, i) => (
          <li key={i}>
            <a href={link.target_url} className="text-slate-700 underline hover:text-slate-900">
              {link.anchor}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
