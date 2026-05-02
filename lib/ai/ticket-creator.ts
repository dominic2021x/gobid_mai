/**
 * Creează automat tichete pentru întrebări fără răspuns relevant
 */

export interface TicketData {
  id: string;
  question: string;
  timestamp: string;
  status: 'neprocesat' | 'procesat' | 'rezolvat';
  userId?: string;
  conversationId?: string;
  source: 'ai-auto';
  metadata?: {
    queryType?: string;
    searchScore?: number;
    collectionsSearched?: string[];
  };
}

/**
 * Creează un tichet automat în localStorage (sau poate fi extins pentru DB)
 */
export function createAutoTicket(data: {
  question: string;
  userId?: string;
  conversationId?: string;
  queryType?: string;
  searchScore?: number;
  collectionsSearched?: string[];
}): TicketData {
  const ticket: TicketData = {
    id: `ticket-ai-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    question: data.question,
    timestamp: new Date().toISOString(),
    status: 'neprocesat',
    userId: data.userId,
    conversationId: data.conversationId,
    source: 'ai-auto',
    metadata: {
      queryType: data.queryType,
      searchScore: data.searchScore,
      collectionsSearched: data.collectionsSearched,
    },
  };

  // Salvează în localStorage (doar în browser) sau într-un fișier (Node.js)
  if (typeof window !== 'undefined') {
    try {
      const existingTickets = JSON.parse(localStorage.getItem('ai-auto-tickets') || '[]');
      existingTickets.push(ticket);
      localStorage.setItem('ai-auto-tickets', JSON.stringify(existingTickets));
      
      // Creează și un tichet normal pentru admin (dacă există sistemul de tichete)
      const adminTickets = JSON.parse(localStorage.getItem('admin_tickets') || '[]');
      const adminTicket = {
        id: ticket.id,
        userEmail: data.userId || 'unknown@example.com',
        userName: data.userId || 'Utilizator',
        subject: `Întrebare AI neprocesată: ${data.question.substring(0, 50)}...`,
        message: data.question,
        status: 'neprocesat',
        priority: 'medium',
        category: 'ai-auto',
        createdAt: ticket.timestamp,
      };
      adminTickets.push(adminTicket);
      localStorage.setItem('admin_tickets', JSON.stringify(adminTickets));
    } catch (error) {
      console.error('Error saving auto ticket:', error);
    }
  } else {
    // În Node.js, logăm ticket-ul (poate fi extins pentru DB real)
    console.log('Auto-ticket created (server-side):', JSON.stringify(ticket, null, 2));
    // TODO: Salvare în DB (PostgreSQL, SQLite, etc.)
  }

  return ticket;
}

/**
 * Verifică dacă ar trebui creat un tichet bazat pe rezultatele căutării
 */
export function shouldCreateTicket(
  searchResults: Array<{ score: number }>,
  minScore: number = 0.3
): boolean {
  // Creează tichet dacă:
  // 1. Nu sunt rezultate
  // 2. Cel mai bun rezultat are scor mic (mai mic decât threshold)
  if (searchResults.length === 0) {
    return true;
  }

  const bestScore = searchResults[0]?.score || 0;
  return bestScore < minScore;
}

