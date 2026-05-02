import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";

export const metadata = {
  title: "GO AI | gobid.ro",
  description: "GO AI – asistent prietenos pentru navigare și creare anunțuri.",
};

export default async function AssistantPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login?next=/dashboard/assistant");
  }
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
          GO AI
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Iconița de chat este mereu în dreapta jos. Apasă pentru a deschide conversația. Te pot ghida în panou sau la crearea unui anunț.
        </p>
      </header>
    </div>
  );
}
