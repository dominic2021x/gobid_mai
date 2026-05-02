"use client";

import { useCallback, useState } from "react";
import "./robotMascot.css";

const DEFAULT_IDLE = "/mascot/robot_spritesheet_12.png";

export type RobotMascotVariant = "idle" | "kick";

export type RobotMascotProps = {
  /** Width of one frame (container width). */
  width?: number;
  /** Height of the sprite (container height). */
  height?: number;
  /** Idle spritesheet URL. */
  idleSpriteSheet?: string;
  /** Optional kick spritesheet URL; if not set, kick uses idle sheet with one cycle. */
  kickSpriteSheet?: string;
  /** Trigger kick on hover as well as click. */
  kickOnHover?: boolean;
  /** Accessible label. */
  "aria-label"?: string;
  className?: string;
};

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function RobotMascot({
  width = 64,
  height = 64,
  idleSpriteSheet = DEFAULT_IDLE,
  kickSpriteSheet,
  kickOnHover = false,
  "aria-label": ariaLabel = "Mascot",
  className = "",
}: RobotMascotProps) {
  const [variant, setVariant] = useState<RobotMascotVariant>("idle");

  const handleKick = useCallback(() => {
    if (prefersReducedMotion()) return;
    setVariant("kick");
  }, []);

  const handleAnimationEnd = useCallback((e: React.AnimationEvent<HTMLDivElement>) => {
    if (e.animationName === "mascot-kick") {
      setVariant("idle");
    }
  }, []);

  const bgImage =
    variant === "kick" && kickSpriteSheet ? kickSpriteSheet : idleSpriteSheet;

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={`mascot mascot--${variant} ${className}`.trim()}
      style={{
        width,
        height,
        backgroundImage: `url(${bgImage})`,
      }}
      onClick={handleKick}
      onMouseEnter={kickOnHover ? handleKick : undefined}
      onAnimationEnd={handleAnimationEnd}
    />
  );
}
