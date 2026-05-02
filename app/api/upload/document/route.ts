/**
 * API Route - Document Upload (PDF)
 * POST /api/upload/document
 * Uploads documents to Supabase storage using supabaseAdmin to bypass RLS
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const userId = formData.get('userId') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'Nu a fost selectat niciun fișier.' },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'userId este obligatoriu.' },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type) && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { error: 'Format neacceptat. Acceptă doar: PDF, DOC, DOCX, TXT.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Fișierul este prea mare. Dimensiunea maximă este ${MAX_FILE_SIZE / 1024 / 1024}MB.` },
        { status: 400 }
      );
    }

    const sanitizedName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const uniqueSuffix = Math.random().toString(36).slice(2, 8);
    const storagePath = `licitation-docs/${userId}/${Date.now()}-${uniqueSuffix}-${sanitizedName}`;

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const { error: uploadError } = await supabaseAdmin.storage
      .from('product-documents')
      .upload(storagePath, buffer, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type || 'application/pdf',
      });

    if (uploadError) {
      console.error('Document upload error:', uploadError);
      return NextResponse.json(
        {
          error: uploadError.message || 'Nu am putut încărca documentul.',
          details: process.env.NODE_ENV === 'development' ? uploadError : undefined,
        },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from('product-documents')
      .getPublicUrl(storagePath);

    return NextResponse.json({
      success: true,
      url: publicUrlData.publicUrl,
      name: file.name,
      size: file.size,
      type: file.type,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Document upload error:', err);
    return NextResponse.json(
      { error: err.message || 'Eroare la încărcarea documentului.' },
      { status: 500 }
    );
  }
}
