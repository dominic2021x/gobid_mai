"use client";

import { useState } from "react";
import Link from "next/link";
import { User, Mail, MessageSquare, Building2, ChevronDown } from "lucide-react";

const SUBJECT_OPTIONS = [
  { value: "contact", label: "Contact general / Întrebări" },
  { value: "partners", label: "Parteneriate / Colaborare" },
  { value: "website_error", label: "Eroare website / Bug" },
  { value: "tokens", label: "Tokeni / Cont / Plată" },
  { value: "other", label: "Altele" },
] as const;

export default function ContactForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [contactAsCompany, setContactAsCompany] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);

    const name = (fd.get("name") as string)?.trim() ?? "";
    const email = (fd.get("email") as string)?.trim() ?? "";
    const message = (fd.get("message") as string)?.trim() ?? "";
    const website = (fd.get("website") as string) ?? "";
    const subject = (fd.get("subject") as string) || "contact";
    const companyName = contactAsCompany ? (fd.get("companyName") as string)?.trim() ?? "" : "";
    const privacyAccepted = fd.get("privacyAccepted") === "on" || fd.get("privacyAccepted") === "true";

    if (!name || !email || !message) {
      setErrorMsg("Completați toate câmpurile obligatorii.");
      setStatus("error");
      return;
    }
    if (!privacyAccepted) {
      setErrorMsg("Trebuie să acceptați Politica de confidențialitate.");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setErrorMsg("");

    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        message,
        privacyAccepted: true,
        website,
        subject: SUBJECT_OPTIONS.some((o) => o.value === subject) ? subject : "contact",
        companyName: companyName || undefined,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setErrorMsg((data as { error?: string }).error ?? "Eroare la trimitere.");
      setStatus("error");
      return;
    }

    if ((data as { ok?: boolean }).ok) {
      setStatus("success");
      form.reset();
      setContactAsCompany(false);
    } else {
      setErrorMsg((data as { error?: string }).error ?? "Eroare la trimitere.");
      setStatus("error");
    }
  }

  const baseInput =
    "rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-slate-900 placeholder-slate-500 transition-all duration-200 focus:border-amber-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:placeholder-slate-400 sm:rounded-xl sm:px-4 sm:py-3.5";
  const labelClass = "flex flex-col gap-1 text-sm font-medium text-slate-700 sm:gap-1.5";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
      {/* Subiect / Motiv */}
      <div className={labelClass}>
        <span className="text-slate-900">Subiect / Motivul contactului</span>
        <div className="relative">
          <select
            name="subject"
            defaultValue="contact"
            className={`${baseInput} w-full appearance-none pr-10`}
            aria-label="Alegeți subiectul"
          >
            {SUBJECT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-amber-500" />
        </div>
      </div>

      {/* Nume */}
      <label className={labelClass}>
        <span className="flex items-center gap-2 text-slate-900">
          <User className="h-4 w-4 text-amber-500" />
          Nume complet
        </span>
        <input
          type="text"
          name="name"
          required
          maxLength={200}
          placeholder="Ex. Ion Popescu"
          className={baseInput}
        />
      </label>

      {/* Email */}
      <label className={labelClass}>
        <span className="flex items-center gap-2 text-slate-900">
          <Mail className="h-4 w-4 text-amber-500" />
          Email
        </span>
        <input
          type="email"
          name="email"
          required
          maxLength={320}
          placeholder="exemplu@email.ro"
          className={baseInput}
        />
      </label>

      {/* Contact ca firmă */}
      <div className="rounded-lg border border-amber-200/60 bg-amber-50/40 p-3 sm:rounded-xl sm:p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={contactAsCompany}
            onChange={(e) => setContactAsCompany(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 focus:ring-offset-0"
          />
          <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <Building2 className="h-4 w-4 text-amber-500" />
            Contactez ca firmă / reprezent o companie
          </span>
        </label>
        {contactAsCompany && (
          <label className={`mt-2 block sm:mt-3 ${labelClass}`}>
            <span className="text-slate-600">Nume firmă</span>
            <input
              type="text"
              name="companyName"
              maxLength={200}
              placeholder="Ex. SC Exemplu SRL"
              className={baseInput}
            />
          </label>
        )}
      </div>

      {/* Mesaj */}
      <label className={labelClass}>
        <span className="flex items-center gap-2 text-slate-900">
          <MessageSquare className="h-4 w-4 text-amber-500" />
          Mesaj
        </span>
        <textarea
          name="message"
          required
          rows={4}
          maxLength={5000}
          placeholder="Descrieți solicitarea sau întrebarea..."
          className={`${baseInput} min-h-[100px] resize-y sm:min-h-[120px] sm:rows-5`}
        />
      </label>

      {/* Honeypot */}
      <div className="absolute -left-[9999px] top-0" aria-hidden="true">
        <label>
          Website (nu completați)
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      {/* Confidențialitate */}
      <label className="flex items-start gap-3 text-sm text-slate-600">
        <input
          type="checkbox"
          name="privacyAccepted"
          required
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 focus:ring-offset-0"
        />
        <span>
          Am citit și accept{" "}
          <Link
            href="/legal/politica-confidentialitate"
            className="font-medium text-amber-700 underline hover:text-amber-800"
          >
            Politica de confidențialitate
          </Link>
          .
        </span>
      </label>

      {errorMsg && (
        <p
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm"
          role="alert"
        >
          {errorMsg}
        </p>
      )}
      {status === "success" && (
        <p
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800 sm:rounded-xl sm:px-4 sm:py-3 sm:text-sm"
          role="status"
        >
          Mesajul a fost trimis cu succes. Vă vom răspunde în cel mai scurt timp.
        </p>
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-amber-900/20 transition-all duration-200 hover:from-amber-500 hover:to-amber-400 hover:shadow-lg hover:shadow-amber-900/25 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50 sm:w-auto sm:min-w-[220px] sm:px-6 sm:py-4"
      >
        {status === "loading" ? "Se trimite..." : "Trimite mesaj"}
      </button>
    </form>
  );
}
