/**
 * WhatsApp Business API - Get Messages for Conversation
 * Returnează mesajele pentru o conversație specifică
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 30;

interface Message {
  id: string;
  from: string;
  content: string;
  timestamp: Date | string;
  status?: 'sent' | 'delivered' | 'read';
  type?: 'text' | 'image' | 'document' | 'voice';
  isAdmin?: boolean;
}

/**
 * GET /api/admin/whatsapp/conversations/[phoneNumber]/messages
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ phoneNumber: string }> }
) {
  try {
    const { phoneNumber } = await params;
    const decodedPhoneNumber = decodeURIComponent(phoneNumber);

    const whatsappApiUrl = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v21.0';
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken) {
      // Fallback: returnează mesaje mock
      return NextResponse.json({
        messages: getMockMessages(decodedPhoneNumber),
      });
    }

    // TODO: Implementează integrarea reală cu WhatsApp Business API
    // Pentru moment, returnează mock data

    // Exemplu de integrare reală:
    /*
    const response = await fetch(
      `${whatsappApiUrl}/${phoneNumberId}/messages?to=${encodeURIComponent(decodedPhoneNumber)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch messages from WhatsApp API');
    }

    const data = await response.json();
    const messages = transformWhatsAppMessages(data.data || [], phoneNumberId);
    */

    return NextResponse.json({
      messages: getMockMessages(decodedPhoneNumber),
    });
  } catch (error: any) {
    console.error('Error fetching WhatsApp messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Mock messages pentru development
 */
function getMockMessages(phoneNumber: string): Message[] {
  // Mesaje mock bazate pe numărul de telefon
  const mockMessages: Record<string, Message[]> = {
    '+40741657029': [
      {
        id: '1',
        from: '+40741657029',
        content: 'Bună ziua! Am comandat o mobilă pe data de 27 oct., cât este timpul pt. transport?',
        timestamp: new Date(Date.now() - 3600000),
        status: 'read',
      },
      {
        id: '2',
        from: 'admin',
        content: 'Bună ziua! 👋 Sunt Maria, asistenta ta virtuală. Cu ce te pot ajuta astăzi?',
        timestamp: new Date(Date.now() - 3500000),
        isAdmin: true,
        status: 'delivered',
      },
      {
        id: '3',
        from: 'admin',
        content: 'Verific si revin catre Dvs. in ceva momente',
        timestamp: new Date(Date.now() - 3400000),
        isAdmin: true,
        status: 'read',
      },
      {
        id: '4',
        from: '+40741657029',
        content: 'Buna ziua',
        timestamp: new Date(Date.now() - 3300000),
        status: 'read',
      },
      {
        id: '5',
        from: '+40741657029',
        content: 'Mulțumesc',
        timestamp: new Date(Date.now() - 900000),
        status: 'read',
      },
      {
        id: '6',
        from: '+40741657029',
        content: 'Cu drag! O zi frumoasa!',
        timestamp: new Date(Date.now() - 600000),
        status: 'read',
      },
    ],
  };

  return mockMessages[phoneNumber] || [];
}

/**
 * Transformă datele din WhatsApp Business API în formatul aplicației
 */
function transformWhatsAppMessages(apiData: any[], adminPhoneNumberId: string): Message[] {
  return apiData.map((item: any) => ({
    id: item.id || item.message_id,
    from: item.from === adminPhoneNumberId ? 'admin' : item.from,
    content: item.text?.body || item.body || '',
    timestamp: new Date(parseInt(item.timestamp) * 1000),
    status: item.status === 'read' ? 'read' : item.status === 'delivered' ? 'delivered' : 'sent',
    type: item.type || 'text',
    isAdmin: item.from === adminPhoneNumberId,
  }));
}
