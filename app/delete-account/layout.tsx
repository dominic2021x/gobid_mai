import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ștergere cont | gobid.ro",
  description:
    "Instrucțiuni oficiale pentru ștergerea contului și a datelor personale din platforma gobid.ro.",
  alternates: {
    canonical: "https://www.gobid.ro/delete-account",
  },
};

export default function DeleteAccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
