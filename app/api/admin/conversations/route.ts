/**
 * API Route: GET /api/admin/conversations
 * Returnează lista de conversații pentru admin
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

// Mock data - înlocuiește cu date reale din baza de date
const mockConversations = [
  {
    id: 'conv-1',
    userId: 'user-1',
    userName: 'Ion Popescu',
    userAvatar: undefined,
    lastMessage: 'Mulțumesc pentru ajutor!',
    lastMessageTime: new Date(Date.now() - 5 * 60000), // 5 minute ago
    unreadCount: 2,
    isOnline: true,
    department: 'Suport Tehnic',
  },
  {
    id: 'conv-2',
    userId: 'user-2',
    userName: 'Maria Ionescu',
    userAvatar: undefined,
    lastMessage: 'Când pot primi factura?',
    lastMessageTime: new Date(Date.now() - 30 * 60000), // 30 minute ago
    unreadCount: 0,
    isOnline: false,
    department: 'Plăți și Facturare',
  },
  {
    id: 'conv-3',
    userId: 'user-3',
    userName: 'Gheorghe Georgescu',
    userAvatar: undefined,
    lastMessage: 'Am o problemă cu licitația...',
    lastMessageTime: new Date(Date.now() - 2 * 3600000), // 2 hours ago
    unreadCount: 1,
    isOnline: true,
    department: 'Licitații',
  },
];

export async function GET(request: NextRequest) {
  try {
    // TODO: Înlocuiește cu query real din baza de date
    // const conversations = await db.conversations.findMany({
    //   include: { user: true, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    //   orderBy: { updatedAt: 'desc' },
    // });

    // Pentru moment, returnează mock data
    const conversations = mockConversations.map((conv) => ({
      ...conv,
      lastMessageTime: conv.lastMessageTime.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      conversations,
    });
  } catch (error: any) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch conversations',
        message: error.message,
      },
      { status: 500 }
    );
  }
}
