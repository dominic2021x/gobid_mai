/**
 * API Route: GET /api/admin/conversations/[conversationId]
 * Returnează informații despre o conversație specifică
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

// Mock data
const mockConversations: Record<string, any> = {
  'conv-1': {
    id: 'conv-1',
    userId: 'user-1',
    userName: 'Ion Popescu',
    userAvatar: undefined,
    isOnline: true,
    department: 'Suport Tehnic',
  },
  'conv-2': {
    id: 'conv-2',
    userId: 'user-2',
    userName: 'Maria Ionescu',
    userAvatar: undefined,
    isOnline: false,
    department: 'Plăți și Facturare',
  },
  'conv-3': {
    id: 'conv-3',
    userId: 'user-3',
    userName: 'Gheorghe Georgescu',
    userAvatar: undefined,
    isOnline: true,
    department: 'Licitații',
  },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;

    // TODO: Înlocuiește cu query real din baza de date
    // const conversation = await db.conversations.findUnique({
    //   where: { id: conversationId },
    //   include: { user: true },
    // });

    const conversation = mockConversations[conversationId];

    if (!conversation) {
      return NextResponse.json(
        {
          success: false,
          error: 'Conversation not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      conversation,
    });
  } catch (error: any) {
    console.error('Error fetching conversation:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch conversation',
        message: error.message,
      },
      { status: 500 }
    );
  }
}
