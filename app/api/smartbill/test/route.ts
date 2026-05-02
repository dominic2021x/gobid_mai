/**
 * API Route pentru testarea conexiunii SmartBill
 * POST /api/smartbill/test
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, token, companyVATNumber } = body;

    // Validare
    if (!username || !token) {
      return NextResponse.json(
        { success: false, message: 'Username și token sunt obligatorii' },
        { status: 400 }
      );
    }

    // Testează conexiunea la SmartBill API
    // SmartBill API base URL - format: https://ws.smartbill.ro/SBORO/api
    // Pentru conturile SmartBill, URL-ul poate varia în funcție de tipul contului
    const baseUrl = 'https://ws.smartbill.ro/SBORO/api';
    const auth = Buffer.from(`${username}:${token}`).toString('base64');

    try {
      // SmartBill API endpoints pentru testare
      // Dacă avem CIF, folosim /settings/company cu CIF în query
      // Altfel, încercăm /series care este mai simplu
      let endpoint = '/series';
      let url = `${baseUrl}${endpoint}`;
      
      // Dacă avem CIF, adaugă-l ca parametru
      if (companyVATNumber) {
        const params = new URLSearchParams({ cif: companyVATNumber });
        url = `${baseUrl}${endpoint}?${params}`;
      }
      
      console.log('Testing SmartBill connection:', { url, username, hasToken: !!token, hasCIF: !!companyVATNumber });
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Basic ${auth}`,
        },
      });

      // Verifică content-type înainte de a parsa JSON
      const contentType = response.headers.get('content-type');
      let data: any;

      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        // Dacă nu este JSON, încercă să citească textul pentru debugging
        const text = await response.text();
        console.error('SmartBill returned non-JSON:', text.substring(0, 500));
        
        return NextResponse.json(
          { 
            success: false, 
            message: `SmartBill API a returnat un răspuns neașteptat (${response.status}). Verifică credențialele.`,
            details: text.substring(0, 200)
          },
          { status: response.status }
        );
      }

      if (!response.ok) {
        return NextResponse.json(
          { 
            success: false, 
            message: data.message || data.error || `API Error: ${response.status}`,
            data: data 
          },
          { status: response.status }
        );
      }

      return NextResponse.json(
        { 
          success: true, 
          message: 'Conexiunea cu SmartBill este funcțională!',
          data: data 
        },
        { status: 200 }
      );
    } catch (error: any) {
      console.error('SmartBill API Error:', error);
      return NextResponse.json(
        { 
          success: false, 
          message: error.message || 'Eroare de rețea la conectarea cu SmartBill',
          details: error.toString()
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error in /api/smartbill/test:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: error.message || 'Eroare la testarea conexiunii SmartBill' 
      },
      { status: 500 }
    );
  }
}
