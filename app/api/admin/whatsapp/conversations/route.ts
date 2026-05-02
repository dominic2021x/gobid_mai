/**
 * WhatsApp Business API - Get Conversations List
 * Returnează lista de conversații sincronizată cu WhatsApp Business API
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 30;

interface Conversation {
  id: string;
  phoneNumber: string;
  name?: string;
  avatar?: string;
  lastMessage?: string;
  lastMessageTime?: Date | string;
  unreadCount?: number;
  isPinned?: boolean;
  status?: 'online' | 'typing' | 'last seen';
  lastSeen?: string;
}

/**
 * GET /api/admin/whatsapp/conversations
 * Returnează lista de conversații din WhatsApp Business API
 */
export async function GET(request: NextRequest) {
  try {
    const whatsappApiUrl = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v21.0';
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken) {
      // Fallback: returnează conversații mock pentru development
      return NextResponse.json({
        conversations: getMockConversations(),
      });
    }

    // TODO: Implementează integrarea reală cu WhatsApp Business API
    // Pentru moment, returnează mock data
    
    // Exemplu de integrare reală (decomentează când ai configurat WhatsApp Business API):
    /*
    const response = await fetch(`${whatsappApiUrl}/${phoneNumberId}/conversations`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch conversations from WhatsApp API');
    }

    const data = await response.json();
    const conversations = transformWhatsAppConversations(data.data || []);
    */

    return NextResponse.json({
      conversations: getMockConversations(),
    });
  } catch (error: any) {
    console.error('Error fetching WhatsApp conversations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversations', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Mock conversations pentru development
 */
function getMockConversations(): Conversation[] {
  // Conversații mock
  return [
    {
      id: '1',
      phoneNumber: '+40741657029',
      name: '+40 741 657 029',
      lastMessage: '✓✓ Cu drag! O zi frumoasa!',
      lastMessageTime: new Date(),
      unreadCount: 0,
      status: 'online',
    },
    {
      id: '2',
      phoneNumber: '+40723395265',
      name: '+40 723 395 265',
      lastMessage: 'https://www.demeca.ro/?s=92298',
      lastMessageTime: new Date(Date.now() - 86400000), // Yesterday
      unreadCount: 2,
    },
    {
      id: '3',
      phoneNumber: '+40723361050',
      name: '+40 723 361 050',
      lastMessage: 'Missed voice call',
      lastMessageTime: new Date(Date.now() - 1728000000), // 20 days ago
      unreadCount: 1,
    },
  ];
}

/**
 * Transformă datele din WhatsApp Business API în formatul aplicației
 */
function transformWhatsAppConversations(apiData: any[]): Conversation[] {
  return apiData.map((item: any) => ({
    id: item.id || item.phone_number_id,
    phoneNumber: item.phone_number || item.from,
    name: item.profile_name || item.phone_number,
    avatar: item.profile_picture,
    lastMessage: item.last_message?.text || item.message?.body,
    lastMessageTime: item.last_message_time || item.timestamp,
    unreadCount: item.unread_count || 0,
    status: item.status || undefined,
    lastSeen: item.last_seen,
  }));
}
