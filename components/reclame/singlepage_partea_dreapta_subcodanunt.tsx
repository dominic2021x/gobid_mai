"use client";

import * as React from "react";
import Image from "next/image";
import { motion } from "framer-motion";
// lucide: doar săgeată CTA + închidere (fără Megaphone/Sparkles — zona AI e doar efecte CSS)
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ButtonWithIcon } from "@/components/ui/button-with-icon";
import CpuArchitecture from "@/components/ui/cpu-architecture";
import { RevealText } from "@/components/ui/reveal-text";

const NOERROR_LOGO_SRC = "/reclame/noerror-logo.png";

export type RightSidebarAd = {
  id: string;
  title: string;
  description?: string;
  ctaLabel?: string;
  href?: string;
  imageUrl?: string;
  startsAt?: string;
  endsAt?: string;
  isActive: boolean;
  priority?: number;
};

type SinglepageParteaDreaptaSubcodAnuntProps = {
  isDarkMode?: boolean;
  ad?: RightSidebarAd;
  onClose?: () => void;
  resetKey?: string | number;
};

function Grid({
  cellSize = 12,
  strokeWidth = 1,
  patternOffset = [0, 0],
  className,
}: {
  cellSize?: number;
  strokeWidth?: number;
  patternOffset?: [number, number];
  className?: string;
}) {
  const id = React.useId();

  return (
    <svg
      className={cn("pointer-events-none absolute inset-0 text-black/10 dark:text-white/5", className)}
      width="100%"
      height="100%"
    >
      <defs>
        <pattern
          id={`grid-${id}`}
          x={patternOffset[0] - 1}
          y={patternOffset[1] - 1}
          width={cellSize}
          height={cellSize}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${cellSize} 0 L 0 0 0 ${cellSize}`}
            fill="transparent"
            stroke="currentColor"
            strokeWidth={strokeWidth}
          />
        </pattern>
      </defs>
      <rect fill={`url(#grid-${id})`} width="100%" height="100%" />
    </svg>
  );
}

type Particle = { id: number; x: number; y: number; delay: number };

function useParticles(enabled: boolean, resetKey?: string | number) {
  const [particles, setParticles] = React.useState<Particle[]>([]);

  React.useEffect(() => {
    if (!enabled) return;
    setParticles(
      Array.from({ length: 30 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        delay: Math.random() * 3,
      }))
    );
  }, [enabled, resetKey]);

  return particles;
}

/** Logo PNG (fără chenar / fără cutie roșie). */
function PremiumBannerLogoRow({ className }: { className?: string }) {
  return (
    <div className={cn("relative flex items-center", className)}>
      <Image
        src={NOERROR_LOGO_SRC}
        alt="NOERROR — sisteme digitale, integrări CRM și ERP, automatizări și AI"
        width={200}
        height={52}
        className="h-[30px] w-auto max-w-[min(100%,220px)] object-contain object-left"
        priority={false}
      />
    </div>
  );
}

type PremiumBannerBodyProps = {
  resetKey?: string | number;
  title: string;
  description?: string;
  /** Text simplu sub descriere */
  subline?: string;
  /** Varianta din prompt: CRM • … + „Platforme custom” accent roșu */
  sublinePromptVariant?: boolean;
  ctaLabel?: string;
  imageUrl?: string | null;
  imageAlt?: string;
  href?: string;
  onClose: () => void;
  onNavigate: (url: string) => void;
  isHovered: boolean;
  setIsHovered: (v: boolean) => void;
  /** Titlu animat literă-cu-literă (reclama NOERROR implicită) */
  revealTitle?: boolean;
};

function PremiumBannerBody({
  resetKey,
  title,
  description,
  subline,
  sublinePromptVariant,
  ctaLabel,
  imageUrl,
  imageAlt,
  href,
  onClose,
  onNavigate,
  isHovered,
  setIsHovered,
  revealTitle = false,
}: PremiumBannerBodyProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const circuitPatternId = React.useId().replace(/:/g, "");
  const [mousePosition, setMousePosition] = React.useState({ x: 0, y: 0 });
  const particles = useParticles(true, resetKey);

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node || !isHovered) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = node.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setMousePosition({ x, y });
    };

    node.addEventListener("mousemove", handleMouseMove);
    return () => node.removeEventListener("mousemove", handleMouseMove);
  }, [isHovered]);

  const openHref = () => {
    if (!href) return;
    onNavigate(href);
  };

  return (
    <div
      key={resetKey != null ? String(resetKey) : "sidebar-ad"}
      ref={containerRef}
      className={cn(
        "relative overflow-hidden rounded-2xl shadow-xl transition-all duration-500 hover:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.18)]",
        "bg-white dark:bg-white",
        "min-h-[360px] p-4 sm:p-5",
        href && "cursor-pointer"
      )}
      role={href ? "button" : undefined}
      tabIndex={href ? 0 : undefined}
      onClick={() => openHref()}
      onKeyDown={(e) => {
        if (!href) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openHref();
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className="absolute inset-0 opacity-30 transition-opacity duration-500"
        style={{
          background: `radial-gradient(circle at ${mousePosition.x}% ${mousePosition.y}%, rgba(239, 68, 68, 0.15), transparent 50%)`,
        }}
      />

      <div className="absolute inset-0 opacity-5">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <defs>
            <pattern
              id={`premium-circuit-${circuitPatternId}`}
              x="0"
              y="0"
              width="60"
              height="60"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M0 30h30M30 0v30M30 30h30M30 30v30"
                stroke="currentColor"
                strokeWidth="0.5"
                fill="none"
                className="text-blue-500"
              />
              <circle cx="30" cy="30" r="2" fill="currentColor" className="text-blue-400" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#premium-circuit-${circuitPatternId})`} />
        </svg>
      </div>

      <Grid cellSize={20} patternOffset={[0, -1]} className="opacity-10 mix-blend-overlay" />

      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute h-1.5 w-1.5 rounded-full bg-gradient-to-r from-blue-400 to-cyan-400"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
          }}
          animate={{
            opacity: [0, 0.8, 0],
            scale: [0, 1.5, 0],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            delay: particle.delay,
            ease: "easeInOut",
          }}
        />
      ))}

      <div className="absolute left-1/2 top-1/2 h-[280px] w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-blue-400/10 to-cyan-400/10 blur-3xl" />

      {!imageUrl ? (
        <div
          className="pointer-events-none absolute left-1/2 top-[3.5rem] z-[6] h-[120px] w-[min(98%,320px)] -translate-x-1/2 opacity-[0.88] sm:top-[3.75rem]"
          aria-hidden
        >
          <CpuArchitecture
            text="AI"
            className="h-full w-full text-neutral-500/75"
            width="100%"
            height="100%"
            lineMarkerSize={18}
          />
        </div>
      ) : null}

      <div className="absolute right-2.5 top-2.5 z-20 flex items-center gap-2">
        <span
          className="pointer-events-none select-none text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400"
          title="Publicitate"
        >
          PUBLICITATE
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }}
          className="rounded-full bg-white/90 p-1.5 text-gray-700 shadow-md ring-1 ring-black/5 transition-all hover:scale-110 hover:bg-white dark:bg-white/90 dark:text-gray-700 dark:ring-black/10 dark:hover:bg-white"
          aria-label="Închide reclama"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="relative z-10 flex min-h-0 flex-col gap-3 sm:gap-4">
        <motion.div
          className="flex flex-wrap items-center gap-2"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <PremiumBannerLogoRow />
        </motion.div>

        <div
          className={cn(
            "flex flex-col items-center",
            imageUrl ? "justify-center gap-3" : "justify-start gap-0"
          )}
        >
          {imageUrl ? (
            <motion.div
              className="relative aspect-[4/3] w-full max-w-[220px] overflow-hidden rounded-xl border border-gray-200/80 shadow-lg"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.15 }}
            >
              <Image
                src={imageUrl}
                alt={imageAlt ?? ""}
                fill
                className="object-cover"
                sizes="220px"
              />
            </motion.div>
          ) : (
            <>
              <span className="sr-only">AI și integrări — schemă procesor</span>
              <div className="h-[120px] w-full max-w-[320px] shrink-0" aria-hidden />
            </>
          )}

          <motion.div
            className={cn(
              "max-w-[min(100%,20rem)] space-y-3 text-center",
              !imageUrl && "-mt-8 sm:-mt-10"
            )}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            {revealTitle ? (
              <>
                <h2 className="sr-only">{title}</h2>
                <div aria-hidden className={cn("w-full", imageUrl ? "mb-1" : "mb-0")}>
                  <RevealText
                    text={title}
                    textColor="text-gray-900"
                    overlayColor="text-red-600"
                    fontSize="text-[15px] font-black leading-snug tracking-tight sm:text-[17px] md:text-lg"
                    letterDelay={0.038}
                    overlayDelay={0.055}
                    overlayLoopDurationSec={3.6}
                    overlayLoopGapSec={0.45}
                    springDuration={420}
                    className="min-h-[3.75rem] sm:min-h-[4.25rem]"
                    innerClassName="gap-x-px gap-y-1"
                  />
                </div>
              </>
            ) : (
              <h2
                className="text-lg font-black leading-snug tracking-tight text-gray-900 dark:text-gray-900 sm:text-xl"
                style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
              >
                {title}
              </h2>
            )}
            {description ? (
              <p className="mb-4 px-2 text-sm leading-relaxed text-gray-700 dark:text-gray-700">
                {description}
              </p>
            ) : null}
            {sublinePromptVariant ? (
              <p className="mb-4 text-xs text-gray-600 dark:text-gray-600">
                Integrări CRM • ERP • Chatbot AI •{" "}
                <span className="font-semibold text-red-600 dark:text-red-600">Platforme custom</span>
              </p>
            ) : subline ? (
              <p className="mb-4 text-xs text-gray-600 dark:text-gray-600">{subline}</p>
            ) : null}
          </motion.div>
        </div>

        {ctaLabel ? (
          <motion.div
            className="mt-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <ButtonWithIcon
              label={ctaLabel}
              onClick={(e) => {
                e.stopPropagation();
                openHref();
              }}
              disabled={!href}
            />
          </motion.div>
        ) : null}
      </div>

      <motion.div
        className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-transparent via-red-500 to-transparent"
        animate={{
          y: [0, 360, 0],
        }}
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: "linear",
        }}
      />
    </div>
  );
}

export default function SinglepageParteaDreaptaSubcodAnunt(
  props: SinglepageParteaDreaptaSubcodAnuntProps
) {
  const { ad, onClose, resetKey } = props;
  const [isMounted, setIsMounted] = React.useState(false);
  const [isVisible, setIsVisible] = React.useState(true);
  const [isHovered, setIsHovered] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  React.useEffect(() => {
    setIsVisible(true);
  }, [resetKey]);

  const handleClose = () => {
    setIsVisible(false);
    onClose?.();
  };

  const openUrl = (url: string) => {
    if (url.startsWith("/")) {
      window.location.assign(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (!isMounted) {
    return <div className="mb-6 hidden lg:block" suppressHydrationWarning />;
  }

  if (!isVisible) return null;

  const sampleAd: RightSidebarAd = {
    id: "noerror-sample",
    title: "FĂRĂ ERORI. DOAR REZULTATE.",
    description:
      "Integrări CRM și ERP, chatbot AI și RAG, automatizări de fluxuri, website-uri performante, API & backend, aplicații (inclusiv React Native / Flutter) și platforme custom — sisteme digitale legate de procesele tale, nu doar pagini.",
    ctaLabel: "Vezi soluțiile",
    href: "https://www.noerror.ro/",
    isActive: true,
    startsAt: "2024-01-01T00:00:00.000Z",
    endsAt: "2099-12-31T23:59:59.999Z",
    priority: 1,
  };

  const resolvedAd = ad ?? sampleAd;

  const hasActiveAd = (() => {
    if (!resolvedAd || !resolvedAd.isActive) return false;
    const now = new Date();
    if (resolvedAd.startsAt && new Date(resolvedAd.startsAt) > now) return false;
    if (resolvedAd.endsAt && new Date(resolvedAd.endsAt) < now) return false;
    return true;
  })();

  if (!hasActiveAd) {
    return (
      <div className="mb-6 hidden lg:block">
        <PremiumBannerBody
          resetKey={resetKey}
          title="Reclama ta aici"
          description="Spațiu premium disponibil pentru închiriere. Propune-ți campania și ajunge la audiența potrivită."
          ctaLabel="Contactează-ne"
          href="/contact"
          imageUrl={null}
          onClose={handleClose}
          onNavigate={openUrl}
          isHovered={isHovered}
          setIsHovered={setIsHovered}
        />
      </div>
    );
  }

  return (
    <div className="mb-6 hidden lg:block">
      <PremiumBannerBody
        resetKey={resetKey}
        title={resolvedAd.title}
        description={resolvedAd.description}
        sublinePromptVariant={!ad}
        revealTitle={!ad}
        ctaLabel={resolvedAd.ctaLabel}
        href={resolvedAd.href}
        imageUrl={resolvedAd.imageUrl ?? null}
        imageAlt={resolvedAd.title}
        onClose={handleClose}
        onNavigate={openUrl}
        isHovered={isHovered}
        setIsHovered={setIsHovered}
      />
    </div>
  );
}
