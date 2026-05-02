"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import supabase from "@/lib/supabase";

export default function AssistantPageGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session?.user) {
        router.replace("/login?next=/dashboard/assistant");
        return;
      }
      setAllowed(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- router instabil → replace în buclă
  }, []);

  if (!allowed) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6 flex items-center justify-center min-h-[200px]">
        <p className="text-gray-500 dark:text-gray-400" suppressHydrationWarning>
          {"Se verific\u0103 autentificarea..."}
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
