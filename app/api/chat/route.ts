import { OPENAI_SDK_API_KEY } from "@/lib/ai/openaiSdkApiKey";
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { retrieveContext, buildContext } from '@/lib/ai/rag-pinecone';
import { detectQueryType } from '@/lib/ai/query-detector';
import { createAutoTicket, shouldCreateTicket } from '@/lib/ai/ticket-creator';
import { loadResponseConfig, findCustomResponse, buildSystemPrompt } from '@/lib/ai/response-config';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';


export const runtime = 'nodejs';
export const maxDuration = 30;

const openai = new OpenAI({ apiKey: OPENAI_SDK_API_KEY });

type QueryType = 'product' | 'page' | 'mixed' | 'unknown';

interface FollowUpQuestion {
  type: 'clarification' | 'suggestion';
  question: string;
  options?: string[];
}

function safeJson<T = any>(v: any): T {
  return (v && typeof v === 'object') ? v : ({} as T);
}

// IMPORTANT: nu lua config brut din client; îl normalizezi/merge-ui cu default.
function getFinalConfig(responseConfig: any) {
  const base = loadResponseConfig();
  // dacă ai deja sanitizeConfig în response-config, folosește-l aici.
  // altfel, măcar un merge defensiv:
  const client = safeJson(responseConfig);
  return {
    ...base,
    ...client,
    templates: { ...base.templates, ...(client.templates || {}) },
    voicePatterns: { ...base.voicePatterns, ...(client.voicePatterns || {}) },
    welcomeMessage: { ...base.welcomeMessage, ...(client.welcomeMessage || {}) },
    customResponses: Array.isArray(client.customResponses) ? client.customResponses : base.customResponses,
  };
}

function pickCollections(queryType: QueryType): string[] {
  if (queryType === 'product') return ['produse'];
  if (queryType === 'page') return ['pagini'];
  if (queryType === 'mixed') return ['produse', 'pagini'];
  return ['produse', 'pagini'];
}

function buildAgentSystemPrompt(agentName: string | undefined, config: any, contextText: string) {
  const agentIntro = agentName ? `Te numești ${agentName} și ești agent de suport pentru platforma gobid.ro.\n` : '';
  const stylePrompt = buildSystemPrompt(config); // dacă ai funcția din config
  return `${agentIntro}${stylePrompt}

Reguli:
- Nu începe cu salut (conversația e deja pornită).
- 2–4 propoziții de obicei; fără liste numerotate la răspunsuri simple.
- Dacă nu ai context suficient, întreabă scurt o clarificare.

${contextText ? `Context:\n${contextText}\n` : ''}`.trim();
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    }

    const body = await request.json();
    const message = body?.message;
    const conversationHistory = Array.isArray(body?.conversationHistory) ? body.conversationHistory : [];

    const {
      conversationId,
      userId,
      userName,
      userAvatar,
      userEmail,
      agentName,
      responseConfig,
    } = body || {};

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const config = getFinalConfig(responseConfig);

    // 0a) Consent la tichet: dacă AI a întrebat "Doriți să deschid un tichet" și user confirmă, creăm tichet
    const lastMsg = conversationHistory.length >= 1 ? conversationHistory[conversationHistory.length - 1] : null;
    const lastRole = lastMsg?.role;
    const lastContent = String(lastMsg?.content || '').toLowerCase();
    const userSaysConsent = /\b(da|vreau|deschide|te rog|ok|bine|sigur|poți|poate|aș vrea|as vrea|desigur)\b/i.test(message.trim());
    const lastAssistantOfferedTicket = lastRole === 'assistant' && /deschid.*tichet|tichet.*suport|doriți să deschid/i.test(lastContent);

    if (lastAssistantOfferedTicket && userSaysConsent) {
      const ticket = createAutoTicket({
        question: message,
        userId,
        conversationId,
        queryType: 'unknown',
        searchScore: 0,
        collectionsSearched: [],
      });
      const confirmMsg = config.templates?.ticketCreatedConfirm
        || 'Am deschis un tichet la suport. Echipa noastră îl va verifica în curând.';
      return NextResponse.json({
        answer: `💡 ${confirmMsg}`,
        sources: [],
        queryType: 'unknown',
        ticketCreated: true,
        ticketId: ticket.id,
        needsHumanSupport: true,
        conversationId: conversationId || `conv-${Date.now()}`,
        followUpQuestions: undefined,
      });
    }

    // 0) Custom responses înainte de orice
    const customResponse = findCustomResponse(message, config);
    if (customResponse) {
      return NextResponse.json({
        answer: customResponse,
        sources: [],
        queryType: 'custom',
        ticketCreated: false,
        ticketId: undefined,
        needsHumanSupport: false,
        conversationId: conversationId || `conv-${Date.now()}`,
        followUpQuestions: undefined,
      });
    }

    // 1) Detect query type
    const queryType = (detectQueryType(message) || 'unknown') as QueryType;

    // 2) Retrieve context cu filter după tip (product/page/mixed)
    const collections = pickCollections(queryType);
    const filter = queryType === 'product' ? { type: 'product' as const } : queryType === 'page' ? { type: 'page' as const } : { type: 'mixed' as const };
    const searchResults = await retrieveContext(message, filter, 5);

    // 3) Ticket logic – NU creăm automat; oferim doar când AI nu rezolvă (user confirmă în mesajul următor)
    const shouldOfferTicket = shouldCreateTicket(searchResults, 0.3);
    let ticketCreated = false;
    let ticketId: string | undefined;

    // 4) Split results (dacă ai mixed)
    const productResults = searchResults.filter((r: any) => r.type === 'product');
    const pageResults = searchResults.filter((r: any) => r.type === 'page');

    // Alege “primary” results în funcție de queryType
    const primaryResults =
      queryType === 'page' ? pageResults :
      queryType === 'product' ? productResults :
      // mixed/unknown -> ce are scor mai bun
      (productResults[0]?.score || 0) >= (pageResults[0]?.score || 0) ? productResults : pageResults;

    const contextText = buildContext(primaryResults);

    // 5) Decide no-results
    const topScore = primaryResults[0]?.score ?? 0;
    const hasRelevant = primaryResults.length > 0 && topScore >= 0.3;

    let answer = '';
    const followUpQuestions: FollowUpQuestion[] = [];

    if (!hasRelevant) {
      // În loc să returnăm direct noResults, apelăm GPT cu cunoștințe despre platformă
      const platformContext = `
Platformă gobid.ro - licitații online:
- Dashboard → Licitațiile mele: produsele publicate de utilizator
- Dashboard → Adaugă Produs: adăugare produse noi
- Tokens: moneda pentru licitații, cumpărare din Dashboard
- Produse aprobate: apar în Licitațiile mele după verificare (24-48h)
- Suport: tichete din chat, echipă disponibilă
`;

      const fallbackPrompt = buildAgentSystemPrompt(agentName, config, platformContext) + `

Utilizatorul a întrebat ceva ce nu am găsit în baza de produse. Folosește cunoștințele despre platformă de mai sus.
Răspunde scurt, util, în română. Dacă chiar nu știu, întreabă o clarificare scurtă. Nu spune "Nu am găsit" - fii util.`;

      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: fallbackPrompt },
            { role: 'user', content: message },
          ],
          temperature: 0.75,
          max_tokens: 300,
        });
        answer = completion.choices[0]?.message?.content || config.templates?.noResults || 'Îmi zici un pic mai exact?';
      } catch (e) {
        answer = config.templates?.noResults || 'Nu am găsit ceva clar. Îmi zici un pic mai exact?';
      }

      if (shouldOfferTicket) {
        const offerMsg = config.templates?.ticketOffer
          || 'Nu am putut găsi un răspuns satisfăcător. Doriți să deschid un tichet către suport pentru a verifica mai atent?';
        answer += `\n\n💡 ${offerMsg}`;
      }

      followUpQuestions.push({
        type: 'clarification',
        question: queryType === 'page' ? 'Despre ce pagină/funcție e vorba?' : 'Ce tip de produs cauți?',
        options: queryType === 'page'
          ? ['Cont', 'Licitații', 'Token', 'Plăți', 'Livrare', 'Altceva']
          : ['Apartamente', 'Mașini', 'Electronice', 'Îmbrăcăminte', 'Mobilier', 'Altele'],
      });
    } else {
      const systemPrompt = buildAgentSystemPrompt(agentName, config, contextText);

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        temperature: 0.75,
        max_tokens: 350,
      });

      answer = completion.choices[0]?.message?.content || 'Nu pot răspunde momentan.';

      // Follow-ups (bugfix la precedență + condiții mai stricte)
      const lower = message.toLowerCase();
      const isCar = lower.includes('mașină') || lower.includes('auto');
      const isApt = lower.includes('apartament');

      const needs = {
        price: !/\d+|preț|pret|sub|peste|până la|pana la|între|intre/.test(lower),
        rooms: isApt && !/\b(1|2|3|4)\b|o cameră|o camera|două camere|doua camere|trei camere|patru/.test(lower),
        color: isCar && !/\balb|negru|roșu|rosu|albastru|gri|verde|galben\b/.test(lower),
        brand: isCar && !/bmw|mercedes|audi|opel|volkswagen|vw|ford|dacia|toyota|hyundai/i.test(message),
      };

      if (needs.price && (isApt || isCar)) {
        followUpQuestions.push({
          type: 'clarification',
          question: 'Ce buget ai în minte?',
          options: ['Sub 50.000 Lei', '50.000 - 100.000 Lei', '100.000 - 200.000 Lei', 'Peste 200.000 Lei'],
        });
      }
      if (needs.rooms) {
        followUpQuestions.push({
          type: 'clarification',
          question: 'Câte camere?',
          options: ['1 cameră', '2 camere', '3 camere', '4+ camere'],
        });
      }
      if (needs.color) {
        followUpQuestions.push({
          type: 'clarification',
          question: 'Ce culoare preferi?',
          options: ['Alb', 'Negru', 'Roșu', 'Albastru', 'Gri', 'Altele'],
        });
      }
      if (needs.brand) {
        followUpQuestions.push({
          type: 'suggestion',
          question: 'Ai vreun brand preferat?',
          options: ['BMW', 'Mercedes', 'Audi', 'Volkswagen', 'Ford', 'Dacia', 'Nu contează'],
        });
      }

      if (shouldOfferTicket) {
        const offerMsg = config.templates?.ticketOffer
          || 'Nu am putut găsi un răspuns satisfăcător. Doriți să deschid un tichet către suport pentru a verifica mai atent?';
        answer += `\n\n💡 ${offerMsg}`;
      }
    }

    const finalConversationId = conversationId || `conv-${Date.now()}`;

    return NextResponse.json({
      answer,
      sources: primaryResults.map((r: any) => ({
        text: (r.text || '').slice(0, 200) + '...',
        source: r.source,
        score: r.score,
        type: r.type,
      })),
      queryType,
      ticketCreated,
      ticketId,
      needsHumanSupport: ticketCreated,
      conversationId: finalConversationId,
      followUpQuestions: followUpQuestions.length ? followUpQuestions : undefined,
      userId,
      userName,
      userAvatar,
      userEmail,
    });
  } catch (error: any) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Error processing chat request', message: error?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
