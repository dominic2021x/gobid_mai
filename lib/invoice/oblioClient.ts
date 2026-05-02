'use client';

import { useState, useEffect } from 'react';

/**
 * Client helper pentru facturi Oblio – folosit în toate fluxurile de plată.
 *
 * Template + email: Factura este generată de Oblio (design-ul lor). Cu sendEmail: true (implicit),
 * Oblio trimite documentul pe email la client (adresa din clientInfo.email), conform Setări > E-mail-uri alarma.
 * Opțional: sendEmail: false doar pentru descărcare PDF, fără email către client.
 */

export interface OblioPaymentPayload {
  date?: string;
  dueDate?: string;
  currency?: string;
  total?: number;
  amount?: number;
  description?: string;
  status?: string;
  items?: Array<{
    name?: string;
    description?: string;
    quantity?: number;
    price?: number;
    amount?: number;
  }>;
}

export interface OblioClientInfo {
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  address?: string;
  city?: string;
  county?: string;
  country?: string;
  phone?: string;
  vatCode?: string;
  cui?: string;
}

export interface RequestOblioInvoiceResult {
  success: boolean;
  link?: string;
  number?: string;
  seriesName?: string;
  message?: string;
}

/**
 * Verifică dacă Oblio este configurat (localStorage – fallback rapid).
 * Pentru status din Admin → Module, folosește useOblioStatus().
 */
export function isOblioConfigured(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem('oblio_config');
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return !!(parsed?.configured && parsed?.enabled !== false);
  } catch {
    return false;
  }
}

/** Status Oblio din API (enabled + configured din Admin → Module) */
export interface OblioStatus {
  enabled: boolean;
  configured: boolean;
  loading: boolean;
}

/**
 * Hook pentru status Oblio din API – folosește pe paginile de plăți/facturi.
 * Fetch la mount; cache în localStorage pentru instant display.
 */
export function useOblioStatus(): OblioStatus {
  const [status, setStatus] = useState<OblioStatus>({
    enabled: false,
    configured: false,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    setStatus((s) => ({ ...s, loading: true }));

    fetch('/api/oblio/status')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const next = {
          enabled: !!data?.enabled,
          configured: !!data?.configured,
          loading: false,
        };
        setStatus(next);
        if (typeof window !== 'undefined') {
          localStorage.setItem(
            'oblio_config',
            JSON.stringify({ configured: next.configured, enabled: next.enabled })
          );
        }
      })
      .catch(() => {
        if (!cancelled) setStatus({ enabled: false, configured: false, loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}

/**
 * Cere crearea unei facturi Oblio via API. Deschide PDF în tab nou dacă success.
 * Returnează { success, link } sau { success: false, message }.
 */
export async function requestOblioInvoice(
  payment: OblioPaymentPayload,
  clientInfo: OblioClientInfo,
  options?: { cif?: string; seriesName?: string; openPdf?: boolean; sendEmail?: boolean }
): Promise<RequestOblioInvoiceResult> {
  try {
    const res = await fetch('/api/oblio/create-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payment,
        clientInfo,
        cif: options?.cif,
        seriesName: options?.seriesName || 'FCT',
        sendEmail: options?.sendEmail !== false,
      }),
    });
    const data = await res.json();
    if (data.success && data.link) {
      if (options?.openPdf !== false && typeof window !== 'undefined') {
        window.open(data.link, '_blank');
      }
      return {
        success: true,
        link: data.link,
        number: data.number,
        seriesName: data.seriesName,
      };
    }
    return {
      success: false,
      message: data.message || 'Nu s-a putut crea factura.',
    };
  } catch (e: any) {
    return { success: false, message: e?.message || 'Eroare la cererea facturii.' };
  }
}

/**
 * Construiește payload payment + clientInfo pentru un tip comun de tranzacție.
 */
export function buildPayloadForTransaction(
  transaction: {
    amount?: number;
    total?: number;
    date?: string;
    description?: string;
    status?: string;
    type?: string;
    credits?: number;
    tokensReceived?: number;
    paymentMethod?: string;
  },
  userInfo: { firstName?: string; lastName?: string; name?: string; email?: string; address?: string; phone?: string }
): { payment: OblioPaymentPayload; clientInfo: OblioClientInfo } {
  const amount = transaction.amount ?? transaction.total ?? 0;
  const today = new Date().toISOString().split('T')[0];
  const due = new Date();
  due.setDate(due.getDate() + 7);
  const dueDate = due.toISOString().split('T')[0];

  const payment: OblioPaymentPayload = {
    date: transaction.date || today,
    dueDate,
    currency: 'RON',
    total: amount,
    amount,
    description: transaction.description || `Plată ${transaction.type || 'servicii'}`,
    status: transaction.status === 'completed' || transaction.status === 'paid' ? 'paid' : 'pending',
    items: [{
      name: transaction.description || (transaction.credits ? `Cumpărare ${transaction.credits} credite` : transaction.tokensReceived ? `Pachet ${transaction.tokensReceived} tokeni` : 'Servicii'),
      quantity: 1,
      price: amount,
      amount,
    }],
  };

  const clientInfo: OblioClientInfo = {
    name: userInfo.name || `${userInfo.firstName || ''} ${userInfo.lastName || ''}`.trim() || 'Client',
    firstName: userInfo.firstName,
    lastName: userInfo.lastName,
    email: userInfo.email,
    address: userInfo.address,
    phone: userInfo.phone,
  };

  return { payment, clientInfo };
}
