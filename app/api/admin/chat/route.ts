/**
 * Admin Chat API - Trimite mesaj de la admin
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { conversationId, message, role = 'assistant' } = body;

    if (!conversationId || !message) {
      return NextResponse.json(
        { error: 'conversationId and message are required' },
        { status: 400 }
      );
    }

    // TODO: În producție, salvează mesajul în baza de date
    // await db.messages.create({
    //   data: {
    //     conversationId,
    //     role,
    //     content: message,
    //     timestamp: new Date(),
    //   }
    // });
    //
    // await db.conversations.update({
    //   where: { id: conversationId },
    //   data: { updatedAt: new Date() }
    // });

    return NextResponse.json({
      success: true,
      message: {
        id: `msg-${Date.now()}`,
        role,
        content: message,
        timestamp: new Date(),
      },
    });
  } catch (error: any) {
    console.error('Error sending admin message:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}

