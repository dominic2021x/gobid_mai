/**
 * Mapează rânduri din `user_payments` (răspuns GET /api/credits → `payments`)
 * la forma așteptată de tab-ul „Tranzacții” din dashboard plăți.
 */
export type UserPaymentApiRow = {
  id: string;
  amount?: number | string | null;
  created_at?: string | null;
  payment_type?: string | null;
  description?: string | null;
  invoice_number?: string | null;
  metadata?: unknown;
  date?: string | null;
};

export type PaymentsUiTransaction = {
  id: string;
  type: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
  date: string;
  paymentMethod: string;
  credits: number;
  bonusPercentage: number;
  invoiceId: string;
};

export function mapUserPaymentsToTransactionRows(
  payments: UserPaymentApiRow[] | null | undefined
): PaymentsUiTransaction[] {
  if (!Array.isArray(payments) || payments.length === 0) return [];

  return payments.map((p) => {
    const meta =
      p.metadata && typeof p.metadata === "object"
        ? (p.metadata as Record<string, unknown>)
        : {};
    const rawStatus = String(meta.status ?? "").toLowerCase();

    let status = "completed";
    if (rawStatus === "failed") {
      status = "failed";
    } else if (rawStatus === "canceled" || rawStatus === "cancelled") {
      status = "canceled";
    } else if (rawStatus === "pending" || rawStatus === "processing") {
      status = "pending";
    } else if (
      Number(p.amount) === 0 &&
      /purchase|premium|tokens/i.test(String(p.payment_type || ""))
    ) {
      status = "pending";
    }

    const pt = String(p.payment_type || "unknown");
    const type =
      pt === "credit_purchase" || pt === "tokens_purchase" ? "credit_purchase" : "purchase";

    const dateStr =
      p.date ||
      (p.created_at ? String(p.created_at).split("T")[0] : "") ||
      new Date().toISOString().split("T")[0];

    const pm = meta.payment_method ?? meta.paymentMethod;
    let paymentMethod = "—";
    if (pm === "netopia" || pm === "Netopia") paymentMethod = "Netopia";
    else if (pm != null && String(pm).trim() !== "") paymentMethod = String(pm);

    return {
      id: p.id,
      type,
      description: p.description || pt.replace(/_/g, " "),
      amount: Number(p.amount) || 0,
      currency: "RON",
      status,
      date: dateStr,
      paymentMethod,
      credits: Number(meta.credits) || 0,
      bonusPercentage: Number(meta.bonus_percentage) || 0,
      invoiceId: p.id,
    };
  });
}
