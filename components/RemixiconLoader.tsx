"use client";

import { useEffect } from "react";

const REMIXICON_URL = "https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css";

/**
 * Aplică stylesheet-ul Remixicon (preload în head). Pe producție (Vercel) preload-ul
 * începe fetch-ul de timpuriu; aici adăugăm link-ul ca să fie folosit imediat.
 */
export default function RemixiconLoader() {
  useEffect(() => {
    if (document.getElementById("remixicon-css")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = REMIXICON_URL;
    link.id = "remixicon-css";
    document.head.appendChild(link);
  }, []);
  return null;
}
