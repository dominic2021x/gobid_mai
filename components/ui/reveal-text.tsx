"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface RevealTextProps {
  text?: string;
  textColor?: string;
  overlayColor?: string;
  fontSize?: string;
  letterDelay?: number;
  overlayDelay?: number;
  overlayDuration?: number;
  springDuration?: number;
  letterImages?: string[];
  className?: string;
  innerClassName?: string;
  /** Durata unei bucle complete pentru sweep-ul roșu (CSS infinite) */
  overlayLoopDurationSec?: number;
  /** Pauză între „valuri” (secunde), adăugată la durata buclei */
  overlayLoopGapSec?: number;
}

const DEFAULT_IMAGES = [
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1469474968028-56623f02e42e?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1518837695005-2083093ee35b?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1519904981063-b0cf448d479e?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1540979388789-6cee28a1cdc9?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
];

export function RevealText({
  text = "STUNNING",
  textColor = "text-gray-900",
  overlayColor = "text-red-600",
  fontSize = "text-sm sm:text-base",
  letterDelay = 0.05,
  overlayDelay = 0.04,
  overlayDuration = 0.35,
  springDuration = 500,
  letterImages = DEFAULT_IMAGES,
  className,
  innerClassName,
  overlayLoopDurationSec = 4,
  overlayLoopGapSec = 0.35,
}: RevealTextProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const sweepId = React.useId().replace(/:/g, "r");

  const chars = text.split("");
  const totalLoopSec = overlayLoopDurationSec + overlayLoopGapSec;
  const staggerSec = overlayDelay > 0 ? overlayDelay : 0.06;
  const peakEnd = Math.min(44, Math.round(8 + overlayDuration * 90));
  const fadeStart = Math.min(58, peakEnd + 22);

  return (
    <div className={cn("relative flex w-full max-w-full items-center justify-center", className)}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes revealSweep_${sweepId} {
              0%, ${fadeStart}%, 100% { opacity: 0; }
              5%, ${peakEnd}% { opacity: 1; }
            }
          `,
        }}
      />
      <div className={cn("flex max-w-full flex-wrap justify-center gap-y-1", innerClassName)}>
        {chars.map((letter, index) => {
          const display = letter === " " ? "\u00A0" : letter;
          const isSpace = letter === " ";

          return (
            <motion.span
              key={`${text}-${index}`}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              className={cn(
                fontSize,
                "relative inline-block cursor-pointer overflow-hidden font-black tracking-tight",
                isSpace && "min-w-[0.35em]"
              )}
              initial={{
                scale: 0,
                opacity: 0,
              }}
              animate={{
                scale: 1,
                opacity: 1,
              }}
              transition={{
                delay: index * letterDelay,
                type: "spring",
                damping: Math.max(7, 11 - springDuration / 400),
                stiffness: Math.min(260, 150 + springDuration / 5),
                mass: 0.75,
              }}
            >
              <motion.span
                className={cn("absolute inset-0", textColor)}
                animate={{
                  opacity: hoveredIndex === index ? 0 : 1,
                }}
                transition={{ duration: 0.1 }}
              >
                {display}
              </motion.span>
              <motion.span
                className="bg-cover bg-clip-text bg-no-repeat text-transparent"
                animate={{
                  opacity: hoveredIndex === index ? 1 : 0,
                  backgroundPosition: hoveredIndex === index ? "10% center" : "0% center",
                }}
                transition={{
                  opacity: { duration: 0.1 },
                  backgroundPosition: {
                    duration: 3,
                    ease: "easeInOut",
                  },
                }}
                style={{
                  backgroundImage: `url('${letterImages[index % letterImages.length]}')`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {display}
              </motion.span>

              <span
                aria-hidden
                className={cn("pointer-events-none absolute inset-0", overlayColor)}
                style={{
                  animation: `revealSweep_${sweepId} ${totalLoopSec}s ease-in-out infinite`,
                  animationDelay: `${index * staggerSec}s`,
                }}
              >
                {display}
              </span>
            </motion.span>
          );
        })}
      </div>
    </div>
  );
}
