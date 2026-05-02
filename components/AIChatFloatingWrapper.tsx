"use client";

import dynamic from "next/dynamic";

const AIChatFloating = dynamic(() => import("./AIChatFloating"), {
  ssr: false,
});

export default function AIChatFloatingWrapper() {
  return <AIChatFloating />;
}

