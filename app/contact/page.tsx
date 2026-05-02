import type { Metadata } from "next";
import Link from "next/link";
import ContactForm from "@/components/contact/ContactForm";
import ContactPageClient from "./ContactPageClient";
import { Mail, MapPin, FileText, Building2, HeadphonesIcon, HandshakeIcon } from "lucide-react";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gobid.ro";

// Dezactivează cache pentru pagina contact — evită versiuni vechi (ex. dark mode)
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Contact | gobid.ro",
  description: "Contactați echipa gobid.ro pentru întrebări despre licitații, conturi sau suport tehnic.",
  alternates: {
    canonical: `${SITE_URL}/contact`,
  },
};

export default function ContactPage() {
  return (
    <ContactPageClient>
      {/* Enterprise alb: fundal alb curat, doar light mode */}
      <div className="min-h-screen bg-white text-slate-900">
        <div
          className="pointer-events-none fixed inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px),
                             linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)`,
            backgroundSize: "48px 48px",
          }}
        />

        <header className="relative border-b border-slate-200 bg-white">
          <div className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 lg:px-16 lg:py-14">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-6">
              <div className="space-y-1.5 sm:space-y-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600 sm:px-4 sm:py-1.5 sm:text-xs sm:tracking-[0.2em]">
                  Contact
                </span>
                <h1 className="text-lg font-extrabold tracking-tight text-slate-900 sm:text-2xl md:text-3xl lg:text-4xl">
                  Contactează echipa gobid.ro
                </h1>
                <p className="max-w-2xl text-sm leading-snug text-slate-600 sm:text-base sm:leading-relaxed">
                  Suport tehnic, întrebări despre licitații sau parteneriate. Răspundem la fiecare mesaj.
                </p>
              </div>
              <div className="hidden shrink-0 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 shadow-sm sm:flex md:px-5 md:py-4">
                <Building2 className="h-5 w-5 text-slate-600 md:h-6 md:w-6" />
                <span className="text-xs font-medium text-slate-700 md:text-sm">
                  gobid.ro · Operat de DMK WEB STRATEGY SRL CUI 54080033
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="relative mx-auto max-w-6xl px-4 pb-12 pt-6 sm:px-6 sm:pt-8 sm:pb-16 md:px-10 lg:px-16 lg:pb-24 lg:pt-12">
          <div className="grid gap-6 lg:grid-cols-3 lg:gap-10">
            {/* Form card — enterprise alb */}
            <section className="lg:col-span-2">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:rounded-2xl">
                <div className="border-b border-slate-100 bg-amber-50/40 px-4 py-4 sm:px-6 sm:py-5 md:px-8 md:py-6">
                  <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 sm:gap-3 sm:text-xl">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 sm:h-10 sm:w-10 sm:rounded-xl">
                      <Mail className="h-4 w-4 sm:h-5 sm:w-5" />
                    </span>
                    Trimite un mesaj
                  </h2>
                  <p className="mt-1 text-xs text-slate-600 sm:mt-2 sm:text-sm">
                    Completați formularul și vă răspundem în cel mai scurt timp.
                  </p>
                </div>
                <div className="p-4 sm:p-6 md:p-8 lg:p-10">
                  <ContactForm />
                </div>
              </div>
            </section>

            {/* Canale de contact */}
            <aside className="space-y-4 sm:space-y-6">
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-2xl sm:p-6 md:p-7">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 sm:text-xs sm:tracking-[0.2em]">
                  Canale de contact
                </h3>
                <ul className="mt-3 space-y-3 sm:mt-5 sm:space-y-4">
                  <li>
                    <a
                      href="mailto:contact@gobid.ro"
                      className="group flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3 transition hover:border-amber-200/80 hover:bg-amber-50/30 hover:shadow-sm sm:items-start sm:gap-4 sm:rounded-xl sm:p-4"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600 transition group-hover:bg-amber-200 sm:h-12 sm:w-12 sm:rounded-xl">
                        <HeadphonesIcon className="h-5 w-5 sm:h-6 sm:w-6" />
                      </span>
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-slate-900 sm:text-base">Suport & general</span>
                        <p className="mt-0.5 text-xs text-slate-600 sm:text-sm">contact@gobid.ro</p>
                      </div>
                    </a>
                  </li>
                  <li>
                    <a
                      href="mailto:partners@gobid.ro"
                      className="group flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3 transition hover:border-emerald-200/80 hover:bg-emerald-50/30 hover:shadow-sm sm:items-start sm:gap-4 sm:rounded-xl sm:p-4"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 transition group-hover:bg-emerald-200 sm:h-12 sm:w-12 sm:rounded-xl">
                        <HandshakeIcon className="h-5 w-5 sm:h-6 sm:w-6" />
                      </span>
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-slate-900 sm:text-base">Parteneriate</span>
                        <p className="mt-0.5 text-xs text-slate-600 sm:text-sm">partners@gobid.ro</p>
                      </div>
                    </a>
                  </li>
                  <li>
                    <div className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3 sm:items-start sm:gap-4 sm:rounded-xl sm:p-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 sm:h-12 sm:w-12 sm:rounded-xl">
                        <MapPin className="h-5 w-5 sm:h-6 sm:w-6" />
                      </span>
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-slate-900 sm:text-base">Sediu social</span>
                        <p className="mt-0.5 text-xs leading-snug text-slate-600 sm:text-sm">
                          Bulevardul Decebal nr. 18, Craiova, România
                        </p>
                      </div>
                    </div>
                  </li>
                </ul>
              </div>

              <Link
                href="/legal/date-identificare"
                className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-amber-200/80 hover:bg-amber-50/20 hover:shadow sm:gap-4 sm:rounded-2xl sm:p-5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition group-hover:bg-amber-100 group-hover:text-amber-600 sm:h-12 sm:w-12 sm:rounded-xl">
                  <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
                </span>
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-slate-900 sm:text-base">Date de identificare</span>
                  <p className="mt-0.5 text-[11px] text-slate-600 sm:text-xs">
                    CUI, Registrul Comerțului, operator
                  </p>
                </div>
              </Link>
            </aside>
          </div>
        </main>
      </div>
    </ContactPageClient>
  );
}
