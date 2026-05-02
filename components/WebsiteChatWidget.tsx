/**
 * WebsiteChatWidget.tsx
 * Wrapper principal pentru chat widget-ul de website
 * Importă și renderizează ChatWidget din /components/chat/
 */

"use client";

import dynamic from 'next/dynamic';

// Dynamic import pentru optimizare performanță
const ChatWidget = dynamic(() => import('./chat/ChatWidget'), {
  ssr: false,
  loading: () => null, // Nu afișa nimic până se încarcă
});

export default function WebsiteChatWidget() {
  return <ChatWidget />;
}

