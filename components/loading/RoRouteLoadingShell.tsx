/**
 * /ro Suspense fallback. Fundal 100% opac (fără /80, /95) ca să nu se vadă prin ele
 * `html.dark body` din globals.css. Clasa `ro-route-loading-shell` primește override în globals
 * ca zona de loading să rămână deschisă chiar dacă restul site-ului e dark.
 */
export default function RoRouteLoadingShell() {
  return (
    <div className="ro-route-loading-shell isolate z-[1] flex min-h-[100dvh] w-full flex-col bg-slate-50">
      <div
        className="ro-route-loading-shell-header h-14 shrink-0 border-b border-slate-200 bg-white shadow-[0_1px_0_0_rgba(15,23,42,0.06)] sm:h-16"
        aria-hidden
      />
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div
          className="mb-6 h-8 max-w-[60%] w-48 rounded-lg bg-slate-200"
          aria-hidden
        />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="ro-route-loading-shell-card aspect-[3/4] overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
              aria-hidden
            />
          ))}
        </div>
      </div>
    </div>
  );
}
