"use client";

/** Text din `normalizeLiveBidDescriptionDisplay` (afișare generală live bid, fără heuristici doar-CSV). */
export default function LiveBidDescriptionText({
  text,
  isDarkMode,
}: {
  text: string;
  isDarkMode: boolean;
}) {
  return (
    <div
      suppressHydrationWarning
      className={`text-sm leading-relaxed whitespace-pre-wrap break-words min-h-[4rem] ${
        isDarkMode ? "text-gray-300" : "text-gray-700"
      }`}
    >
      {text}
    </div>
  );
}
