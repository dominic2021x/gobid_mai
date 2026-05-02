"use client";

type TypingIndicatorProps = {
  forceLight?: boolean;
};

export default function TypingIndicator({ forceLight }: TypingIndicatorProps) {
  return (
    <div className="anim-fade typing-indicator flex w-full justify-start">
      <div
        className={`flex max-w-[75%] items-center gap-2 rounded-2xl rounded-bl-md border px-4 py-2.5 text-sm shadow-sm ${
          forceLight
            ? "border-gray-200/80 bg-gray-100/90 text-gray-500"
            : "border-gray-200/80 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400"
        }`}
      >
        <span className="inline-flex gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
        </span>
        <span className="text-xs">Se gândește…</span>
      </div>
    </div>
  );
}
