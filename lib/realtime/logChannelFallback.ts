/**
 * Realtime poate eșua (publication, RLS, rețea). Nu folosi console.error — nu e excepție de aplicație.
 * Apelează din `.subscribe((status) => { ...; warnRt(status); })`.
 */
export function warnOnceOnRealtimeFailure(
  context: string,
  hint: string,
  extraDetail?: string
): (status: string) => void {
  let logged = false;
  return (status: string) => {
    if (status !== "CHANNEL_ERROR" && status !== "TIMED_OUT") return;
    if (logged) return;
    logged = true;
    const tail = extraDetail?.trim() ? ` ${extraDetail!.trim()}` : "";
    console.warn(
      `[${context}] Realtime indisponibil (${hint}).${tail} Unde există, UI-ul folosește polling / reîncărcare.`
    );
  };
}
