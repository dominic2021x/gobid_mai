"use client";

import { useEffect, useState } from "react";
import VaporizeTextCycle, { Tag } from "@/components/ui/vapour-text-effect";

export default function SinglepageParteaDreapta() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <aside
      className="pointer-events-none fixed top-28 bottom-6 z-20 hidden xl:flex w-[132px] 2xl:w-[148px]"
      style={{ right: "max(10px, calc((100vw - 80rem) / 2 - 160px))" }}
    >
      <div className="relative h-full w-full overflow-hidden rounded-2xl border border-dotted border-slate-300 bg-white shadow-xl">
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-size:16px_16px] [background-image:linear-gradient(to_right,rgba(148,163,184,0.2)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.2)_1px,transparent_1px)]" />

        <div className="relative h-full px-2 py-4">
          {mounted ? (
            <>
              <div className="absolute inset-0 flex items-center justify-center overflow-visible px-2" aria-hidden>
                <div className="h-10 w-[260px] -rotate-90">
                  <VaporizeTextCycle
                    texts={["RECLAMA TA AICI"]}
                    font={{ fontFamily: "Inter, sans-serif", fontSize: "18px", fontWeight: 700 }}
                    color="rgb(31, 41, 55)"
                    spread={3}
                    density={6}
                    animation={{ vaporizeDuration: 2, fadeInDuration: 0.8, waitDuration: 0.7 }}
                    direction="left-to-right"
                    alignment="center"
                    tag={Tag.P}
                  />
                </div>
              </div>
              <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rotate-180 [writing-mode:vertical-rl] text-[10px] tracking-[0.16em] text-slate-400 uppercase">
                Slot Premium
              </span>
            </>
          ) : (
            <span
              className="absolute inset-0 flex items-center justify-center px-2 text-center text-[11px] font-semibold leading-tight text-slate-500"
              aria-hidden
            >
              RECLAMA TA AICI
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
