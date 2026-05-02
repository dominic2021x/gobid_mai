/**
 * API Route: GET/POST /api/admin/messages/[conversationId]
 * GET: Returnează mesajele unei conversații
 * POST: Trimite un mesaj nou (admin → client)
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

// Mock messages storage (înlocuiește cu baza de date reală)
const mockMessages: Record<string, any[]> = {
  'conv-1': [
    {
      id: 'msg-1',
      role: 'user',
      content: 'Bună, am o problemă cu contul meu.',
      timestamp: new Date(Date.now() - 10 * 60000),
      seen: true,
    },
    {
      id: 'msg-2',
      role: 'admin',
      content: 'Bună! Cu ce te pot ajuta exact?',
      timestamp: new Date(Date.now() - 9 * 60000),
      seen: true,
    },
    {
      id: 'msg-3',
      role: 'user',
      content: 'Nu pot accesa licitațiile.',
      timestamp: new Date(Date.now() - 8 * 60000),
      seen: true,
    },
    {
      id: 'msg-4',
      role: 'admin',
      content: 'Înțeleg. Pot să verific contul tău. Care este adresa ta de email?',
      timestamp: new Date(Date.now() - 7 * 60000),
      seen: false,
    },
    {
      id: 'msg-5',
      role: 'user',
      content: 'Mulțumesc pentru ajutor!',
      timestamp: new Date(Date.now() - 5 * 60000),
      seen: false,
    },
  ],
  'conv-2': [
    {
      id: 'msg-6',
      role: 'user',
      content: 'Bună, când pot primi factura?',
      timestamp: new Date(Date.now() - 30 * 60000),
      seen: true,
    },
  ],
  'conv-3': [
    {
      id: 'msg-7',
      role: 'user',
      content: 'Am o problemă cu licitația...',
      timestamp: new Date(Date.now() - 2 * 3600000),
      seen: false,
    },
  ],
};

// GET: Load messages
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;

    // TODO: Înlocuiește cu query real din baza de date
    // const messages = await db.messages.findMany({
    //   where: { conversationId },
    //   orderBy: { createdAt: 'asc' },
    // });

    const messages = mockMessages[conversationId] || [];

    return NextResponse.json({
      success: true,
      messages: messages.map((msg) => ({
        ...msg,
        timestamp: new Date(msg.timestamp).toISOString(),
      })),
    });
  } catch (error: any) {
    console.error('Error fetching messages:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch messages',
        message: error.message,
      },
      { status: 500 }
    );
  }
}

// POST: Send message
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const { content, role, isVoice } = await request.json();

    if (!content || !content.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Message content is required',
        },
        { status: 400 }
      );
    }

    // TODO: Salvează mesajul în baza de date
    // const message = await db.messages.create({
    //   data: {
    //     conversationId,
    //     role: role || 'admin',
    //     content,
    //     isVoice: isVoice || false,
    //   },
    // });

    // Mock: Add message to local storage
    if (!mockMessages[conversationId]) {
      mockMessages[conversationId] = [];
    }

    const newMessage = {
      id: `msg-${Date.now()}`,
      role: role || 'admin',
      content: content.trim(),
      timestamp: new Date(),
      seen: false,
      isVoice: isVoice || false,
    };

    mockMessages[conversationId].push(newMessage);

    // TODO: Trimite mesajul prin WebSocket/Socket.io către client
    // socket.emit('admin-message', {
    //   conversationId,
    //   message: newMessage,
    // });

    return NextResponse.json({
      success: true,
      message: {
        ...newMessage,
        timestamp: newMessage.timestamp.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error sending message:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to send message',
        message: error.message,
      },
      { status: 500 }
    );
  }
}
