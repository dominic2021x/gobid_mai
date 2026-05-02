"use client";

import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

// Dynamic import pentru noul chat widget modular
const WebsiteChatWidget = dynamic(() => import("./WebsiteChatWidget"), {
  ssr: false,
});

export default function ChatWidgetsWrapper() {
  const pathname = usePathname();
  
  // Nu afișa widget-urile de chat în paginile admin
  // Admin are propriul sistem de chat WhatsApp
  if (pathname?.startsWith('/admin')) {
    return null;
  }
  
  return (
    <>
      {/* Website Chat Widget - Modular WhatsApp Style */}
      <WebsiteChatWidget />
    </>
  );
}
