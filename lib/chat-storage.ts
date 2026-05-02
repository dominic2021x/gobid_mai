/**
 * Chat Storage Utility
 * Gestionare conversații și mesaje în localStorage
 * Compatibil cu user chat widget și admin panel
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'admin';
  content: string;
  timestamp: string;
  conversationId: string;
  userId?: string;
  userName?: string;
  userAvatar?: string;
  department?: string;
  read?: boolean;
}

export interface Conversation {
  id: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  userAvatar?: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  isOnline: boolean;
  department?: string;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY_CONVERSATIONS = 'chat_conversations';
const STORAGE_KEY_MESSAGES_PREFIX = 'chat_messages_';

/**
 * Salvează un mesaj în storage
 */
export function saveMessage(message: ChatMessage): void {
  if (typeof window === 'undefined') {
    console.warn('[chat-storage] saveMessage: window is undefined');
    return;
  }

  try {
    console.log('[chat-storage] Saving message:', message);
    
    // Salvează mesajul în lista de mesaje a conversației
    const messagesKey = `${STORAGE_KEY_MESSAGES_PREFIX}${message.conversationId}`;
    const existingMessages = JSON.parse(
      localStorage.getItem(messagesKey) || '[]'
    ) as ChatMessage[];

    console.log('[chat-storage] Existing messages for conversation:', existingMessages.length);

    // Verifică dacă mesajul există deja (după ID)
    const messageIndex = existingMessages.findIndex((m) => m.id === message.id);
    if (messageIndex >= 0) {
      existingMessages[messageIndex] = message;
      console.log('[chat-storage] Updated existing message');
    } else {
      existingMessages.push(message);
      console.log('[chat-storage] Added new message');
    }

    // Sortează după timestamp
    existingMessages.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    localStorage.setItem(messagesKey, JSON.stringify(existingMessages));
    console.log('[chat-storage] Saved messages to:', messagesKey, 'Total:', existingMessages.length);

    // Dispatch custom event pentru sincronizare în același tab
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('chat-storage-updated'));
      console.log('[chat-storage] Dispatched chat-storage-updated event');
    }

    // Actualizează conversația
    updateConversation({
      id: message.conversationId,
      lastMessage: message.content,
      lastMessageTime: message.timestamp,
      userId: message.userId,
      userName: message.userName,
      userAvatar: message.userAvatar,
      department: message.department,
      unreadCount: message.role === 'user' ? 1 : 0, // Incrementă dacă e mesaj de la user
    });

    // Incrementă unread count pentru admin dacă e mesaj de la user
    if (message.role === 'user') {
      incrementUnreadCount(message.conversationId);
    }
  } catch (error) {
    console.error('[chat-storage] Error saving message:', error);
  }
}

/**
 * Obține toate mesajele dintr-o conversație
 */
export function getMessages(conversationId: string): ChatMessage[] {
  if (typeof window === 'undefined') {
    console.warn('[chat-storage] getMessages: window is undefined');
    return [];
  }

  try {
    const messagesKey = `${STORAGE_KEY_MESSAGES_PREFIX}${conversationId}`;
    const messagesStr = localStorage.getItem(messagesKey);
    console.log('[chat-storage] getMessages for:', conversationId, 'Found:', messagesStr ? 'yes' : 'no');
    
    const messages = JSON.parse(messagesStr || '[]') as ChatMessage[];
    console.log('[chat-storage] Loaded', messages.length, 'messages');

    return messages.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  } catch (error) {
    console.error('[chat-storage] Error getting messages:', error);
    return [];
  }
}

/**
 * Actualizează sau creează o conversație
 */
export function updateConversation(data: Partial<Conversation>): Conversation {
  if (typeof window === 'undefined') {
    console.warn('[chat-storage] updateConversation: window is undefined');
    return data as Conversation;
  }

  try {
    console.log('[chat-storage] updateConversation:', data);
    
    let conversations = getAllConversations();
    console.log('[chat-storage] Current conversations:', conversations.length);
    
    const existingIndex = conversations.findIndex((c) => c.id === data.id);

    const now = new Date().toISOString();
    let conversation: Conversation;

    if (existingIndex >= 0) {
      // Actualizează conversația existentă - creează copie nouă
      conversation = {
        ...conversations[existingIndex],
        ...data,
        updatedAt: now,
      };
      // Creează array nou cu conversația actualizată
      conversations = conversations.map((conv, idx) =>
        idx === existingIndex ? conversation : conv
      );
      console.log('[chat-storage] Updated existing conversation');
    } else {
      // Creează conversație nouă
      conversation = {
        id: data.id || `conv-${Date.now()}`,
        userId: data.userId,
        userName: data.userName || 'Utilizator',
        userEmail: data.userEmail,
        userAvatar: data.userAvatar,
        lastMessage: data.lastMessage || '',
        lastMessageTime: data.lastMessageTime || now,
        unreadCount: data.unreadCount || 0,
        isOnline: data.isOnline ?? false,
        department: data.department,
        createdAt: data.createdAt || now,
        updatedAt: now,
      };
      // Creează array nou cu conversația adăugată
      conversations = [...conversations, conversation];
      console.log('[chat-storage] Created new conversation:', conversation.id);
    }

    // Sortează după ultimul mesaj (cel mai recent primul) - creează array nou
    const sortedConversations = [...conversations].sort((a, b) => 
      new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
    );

    localStorage.setItem(STORAGE_KEY_CONVERSATIONS, JSON.stringify(sortedConversations));
    console.log('[chat-storage] Saved conversations to storage. Total:', sortedConversations.length);

    // Dispatch custom event pentru sincronizare în același tab
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('chat-storage-updated'));
    }

    return conversation;
  } catch (error) {
    console.error('[chat-storage] Error updating conversation:', error);
    return data as Conversation;
  }
}

/**
 * Obține toate conversațiile
 */
export function getAllConversations(): Conversation[] {
  if (typeof window === 'undefined') {
    console.warn('[chat-storage] getAllConversations: window is undefined');
    return [];
  }

  try {
    const conversationsStr = localStorage.getItem(STORAGE_KEY_CONVERSATIONS);
    console.log('[chat-storage] getAllConversations - storage has data:', conversationsStr ? 'yes' : 'no');
    
    const conversations = JSON.parse(conversationsStr || '[]') as Conversation[];
    console.log('[chat-storage] Loaded', conversations.length, 'conversations');

    return conversations.sort((a, b) => 
      new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
    );
  } catch (error) {
    console.error('[chat-storage] Error getting conversations:', error);
    return [];
  }
}

/**
 * Obține o conversație după ID
 */
export function getConversation(conversationId: string): Conversation | null {
  if (typeof window === 'undefined') {
    console.warn('[chat-storage] getConversation: window is undefined');
    return null;
  }

  try {
    const conversations = getAllConversations();
    return conversations.find((c) => c.id === conversationId) || null;
  } catch (error) {
    console.error('[chat-storage] Error getting conversation:', error);
    return null;
  }
}

/**
 * Obține conversațiile unui user
 */
export function getUserConversations(userId: string): Conversation[] {
  const conversations = getAllConversations();
  return conversations.filter((c) => c.userId === userId);
}

/**
 * Incrementă numărul de mesaje necitite
 */
export function incrementUnreadCount(conversationId: string): void {
  if (typeof window === 'undefined') return;

  try {
    const conversations = getAllConversations();
    // Creează copie nouă pentru a evita mutarea directă
    const updatedConversations = conversations.map((conv) =>
      conv.id === conversationId
        ? { ...conv, unreadCount: (conv.unreadCount || 0) + 1 }
        : conv
    );
    localStorage.setItem(STORAGE_KEY_CONVERSATIONS, JSON.stringify(updatedConversations));
    
    // Dispatch event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('chat-storage-updated'));
    }
  } catch (error) {
    console.error('[chat-storage] Error incrementing unread count:', error);
  }
}

/**
 * Marchează mesajele unei conversații ca citite
 */
export function markConversationAsRead(conversationId: string): void {
  if (typeof window === 'undefined') return;

  try {
    const conversations = getAllConversations();
    // Creează copie nouă pentru a evita mutarea directă
    const updatedConversations = conversations.map((conv) =>
      conv.id === conversationId
        ? { ...conv, unreadCount: 0 }
        : conv
    );
    localStorage.setItem(STORAGE_KEY_CONVERSATIONS, JSON.stringify(updatedConversations));

    // Marchează și mesajele individuale ca citite - creează copii noi
    const messages = getMessages(conversationId);
    const updatedMessages = messages.map((msg) => ({
      ...msg,
      read: true,
    }));
    const messagesKey = `${STORAGE_KEY_MESSAGES_PREFIX}${conversationId}`;
    localStorage.setItem(messagesKey, JSON.stringify(updatedMessages));
    
    // Dispatch event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('chat-storage-updated'));
    }
  } catch (error) {
    console.error('[chat-storage] Error marking conversation as read:', error);
  }
}

/**
 * Obține user info din localStorage
 */
export function getUserInfo(): {
  firstName?: string;
  lastName?: string;
  email?: string;
  avatar?: string;
  userId?: string;
} | null {
  if (typeof window === 'undefined') return null;

  try {
    const userInfoStr = localStorage.getItem('userInfo');
    if (!userInfoStr) return null;

    const userInfo = JSON.parse(userInfoStr);
    return {
      firstName: userInfo.firstName,
      lastName: userInfo.lastName,
      email: userInfo.email,
      avatar: userInfo.avatar,
      userId: userInfo.email || userInfo.id, // Folosește email ca ID
    };
  } catch (error) {
    console.error('[chat-storage] Error getting user info:', error);
    return null;
  }
}
