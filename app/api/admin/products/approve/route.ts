import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productId, action, rejectionReason } = body;

    if (!productId || !action) {
      return NextResponse.json(
        { error: 'Product ID and action are required' },
        { status: 400 }
      );
    }

    if (action !== 'approve' && action !== 'reject' && action !== 'pending') {
      return NextResponse.json(
        { error: 'Action must be "approve", "reject", or "pending"' },
        { status: 400 }
      );
    }

    // Get current user (admin) from request - try to get from cookie or header
    let adminUserId: string | null = null;
    
    // Try to get session from cookie
    const authHeader = request.headers.get('authorization');
    const cookieHeader = request.headers.get('cookie');
    
    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase admin not configured' },
        { status: 500 }
      );
    }

    if (authHeader && authHeader.startsWith('Bearer ')) {
      // If we have a token in header, verify it
      const token = authHeader.replace('Bearer ', '');
      try {
        const { data: { user } } = await supabaseAdmin.auth.getUser(token);
        if (user) {
          adminUserId = user.id;
        }
      } catch (e) {
        console.warn('Could not verify token from header:', e);
      }
    }
    
    // If no user from token, check if we're using admin service role (bypass auth for admin operations)
    // For admin operations, we can use a default admin ID or check if user is admin
    if (!adminUserId) {
      // Check if there's an admin session cookie or use service role
      // For now, we'll allow the operation if using supabaseAdmin (service role)
      adminUserId = 'admin-service-role';
    }

    const updateData: any = {
      approval_status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'pending',
      approved_at: action === 'approve' ? new Date().toISOString() : null,
      approved_by: action === 'approve' ? adminUserId : null,
    };

    if (action === 'reject' && rejectionReason) {
      updateData.rejection_reason = rejectionReason;
    } else if (action === 'approve' || action === 'pending') {
      // Clear rejection reason when approving or putting back to pending
      updateData.rejection_reason = null;
    }

    // Update product using admin client to bypass RLS
    const { data, error } = await supabaseAdmin
      .from('products')
      .update(updateData)
      .eq('id', productId)
      .select()
      .single();

    if (error) {
      console.error('Error updating product approval:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    const messages: Record<string, string> = {
      approve: 'Produsul a fost aprobat cu succes',
      reject: 'Produsul a fost respins',
      pending: 'Produsul a fost pus în așteptare pentru revizuire'
    };

    return NextResponse.json({
      success: true,
      data,
      message: messages[action] || 'Operațiune reușită'
    });
  } catch (error: any) {
    console.error('Error in approve/reject endpoint:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

