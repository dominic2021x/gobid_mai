import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import OpenAI from 'openai';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


const openai = new OpenAI({
  apiKey: OPENAI_SDK_API_KEY,
});

// POST - Run risk analysis automatically for a product (called internally)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productId } = body;

    if (!productId) {
      return NextResponse.json(
        { error: 'Product ID is required' },
        { status: 400 }
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Get product
    const { data: productData, error: productError } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (productError || !productData) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Only analyze live-bid products (user products, not executor/admin products)
    if (productData.product_type !== 'live-bid') {
      return NextResponse.json(
        { success: true, message: 'Product type not live-bid, skipping analysis' },
        { status: 200 }
      );
    }

    // Get user profile separately if user_id exists
    let userProfile = null;
    if (productData.user_id) {
      const { data: profileData } = await supabaseAdmin
        .from('user_profiles')
        .select('first_name, last_name, phone, created_at')
        .eq('user_id', productData.user_id)
        .single();
      
      userProfile = profileData;
    }

    // Get user's other products for context
    const { data: userProducts } = await supabaseAdmin
      .from('products')
      .select('id, approval_status')
      .eq('user_id', productData.user_id);

    const totalProducts = userProducts?.length || 0;
    const approvedProducts = userProducts?.filter(p => p.approval_status === 'approved').length || 0;
    const rejectedProducts = userProducts?.filter(p => p.approval_status === 'rejected').length || 0;

    // Get IP address from auth metadata (if available)
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(productData.user_id);
    const ipAddress = authUser?.user?.user_metadata?.ip_address || 'N/A';

    // Prepare user data
    const userData = {
      firstName: userProfile?.first_name || 'N/A',
      lastName: userProfile?.last_name || 'N/A',
      email: authUser?.user?.email || 'N/A',
      phone: userProfile?.phone || 'N/A',
      ipAddress: ipAddress,
      registrationDate: userProfile?.created_at || authUser?.user?.created_at || 'N/A',
      totalProducts,
      approvedProducts,
      rejectedProducts,
    };

    // Prepare product data
    const productInfo = {
      title: productData.title || '',
      description: productData.description || '',
      category: productData.category || '',
      startingPrice: productData.starting_price || 0,
      images: Array.isArray(productData.images) ? productData.images : [],
      createdAt: productData.created_at || '',
    };

    // Create AI prompt for risk analysis
    const prompt = `Ești un expert în analiza de risc pentru platforme de licitații online. Analizează următoarele date despre un utilizator și produsul său pentru a identifica potențiale riscuri de fraudă, spam sau activități suspecte.

DATE UTILIZATOR:
- Nume: ${userData.firstName} ${userData.lastName}
- Email: ${userData.email}
- Telefon: ${userData.phone}
- IP: ${userData.ipAddress}
- Data înregistrării: ${userData.registrationDate}
- Total produse: ${userData.totalProducts}
- Produse aprobate: ${userData.approvedProducts}
- Produse respinse: ${userData.rejectedProducts}

DATE PRODUS:
- Titlu: ${productInfo.title}
- Descriere: ${productInfo.description.substring(0, 500)}
- Categorie: ${productInfo.category}
- Preț: ${productInfo.startingPrice} ${productData.currency === 'EUR' ? 'EUR' : 'Lei'}
- Număr imagini: ${productInfo.images.length}
- Data creării: ${productInfo.createdAt}

Analizează și oferă:
1. SCOR DE RISC (0-100): Un scor numeric unde 0 = foarte sigur, 100 = foarte riscant
2. FACTORI DE RISC: Lista factorilor care contribuie la risc (ex: email suspect, preț anormal, descriere incompletă, etc.)
3. RECOMANDARE: "APROBĂ", "RESPINGE", sau "REVIZUIRE MANUALĂ" cu justificare
4. DETALII: Explicație detaliată pentru decizia recomandată

Răspunde în format JSON:
{
  "riskScore": <număr 0-100>,
  "riskFactors": ["factor1", "factor2", ...],
  "recommendation": "APROBĂ" | "RESPINGE" | "REVIZUIRE MANUALĂ",
  "details": "<explicație detaliată>",
  "flags": {
    "suspiciousEmail": <boolean>,
    "suspiciousPrice": <boolean>,
    "incompleteData": <boolean>,
    "newUser": <boolean>,
    "previousRejections": <boolean>
  }
}`;

    // Call OpenAI for risk analysis
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Ești un expert în analiza de risc pentru platforme de licitații online. Analizezi datele utilizatorilor și produselor pentru a identifica potențiale riscuri de fraudă, spam sau activități suspecte. Răspunzi întotdeauna în format JSON valid.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const aiResponse = completion.choices[0]?.message?.content;
    if (!aiResponse) {
      return NextResponse.json(
        { error: 'AI analysis failed' },
        { status: 500 }
      );
    }

    let riskAnalysis;
    try {
      riskAnalysis = JSON.parse(aiResponse);
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      return NextResponse.json(
        { error: 'Failed to parse AI response' },
        { status: 500 }
      );
    }

    // Prepare risk analysis data
    const riskScore = riskAnalysis.riskScore || 0;
    const riskAnalysisData = {
      riskScore: riskScore,
      riskFactors: riskAnalysis.riskFactors || [],
      recommendation: riskAnalysis.recommendation || 'REVIZUIRE MANUALĂ',
      details: riskAnalysis.details || '',
      flags: riskAnalysis.flags || {},
      analyzedAt: new Date().toISOString(),
    };

    // Determine approval status based on risk score
    // If risk score >= 75, set approval_status to 'pending' for manual review
    let newApprovalStatus = productData.approval_status;
    if (riskScore >= 75 && productData.approval_status !== 'approved') {
      newApprovalStatus = 'pending';
    }

    // Update product with risk score and analysis data
    const { error: updateError } = await supabaseAdmin
      .from('products')
      .update({
        risk_score: riskScore,
        risk_analysis_data: riskAnalysisData,
        approval_status: newApprovalStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', productId);

    if (updateError) {
      console.error('[Auto Risk Analysis] Error updating product with risk score:', updateError);
      return NextResponse.json(
        { error: 'Failed to update product with risk score', details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      riskScore: riskScore,
      approvalStatus: newApprovalStatus,
    });
  } catch (error) {
    console.error('Error in auto risk analysis:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
