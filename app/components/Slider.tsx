"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  BuildingOffice2Icon,
  ComputerDesktopIcon,
  CpuChipIcon,
  DevicePhoneMobileIcon,
  GiftIcon,
  HomeModernIcon,
  ShoppingBagIcon,
  SparklesIcon,
  TagIcon,
  TruckIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";

type Slide = {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  image: string;
  buttonText: string;
  buttonSecondary: string;
};

type Notification = {
  read?: boolean;
};

const slides: Slide[] = [
  {
    id: 1,
    title: "Descoperă licitații exclusive",
    subtitle: "Marketplace premium",
    description:
      "Accesează colecții verificate și experiențe premium cu livrare rapidă pe tot teritoriul țării.",
    image: "/images/slider/slider-1-auctions.jpg",
    buttonText: "Vezi licitațiile",
    buttonSecondary: "Află mai multe",
  },
  {
    id: 2,
    title: "Tehnologie de ultimă generație",
    subtitle: "Electronice & Gadget-uri",
    description:
      "Licitează pentru gadget-uri rare, telefoane flagship și accesorii inteligente la prețuri imbatabile.",
    image: "/images/slider/slider-2-premium.jpg",
    buttonText: "Licitează acum",
    buttonSecondary: "Compară oferte",
  },
  {
    id: 3,
    title: "Proprietăți unice pentru toate bugetele",
    subtitle: "Imobiliare & investiții",
    description:
      "Găsește proprietatea perfectă și transformă-ți visul într-o investiție solidă, complet transparentă.",
    image: "/images/slider/slider-3-real-estate.jpg",
    buttonText: "Vezi proprietățile",
    buttonSecondary: "Solicită consultanță",
  },
  {
    id: 4,
    title: "Vehicule gata de drum",
    subtitle: "Auto & transport",
    description:
      "Autoturisme, utilaje și flote complete cu istoric verificat și suport profesional la fiecare pas.",
    image: "/images/slider/slider-4-vehicles.jpg",
    buttonText: "Catalog vehicule",
    buttonSecondary: "Calculează finanțarea",
  },
];

const CATEGORY_ICONS = [
  ShoppingBagIcon, // moda
  DevicePhoneMobileIcon, // electronice
  CpuChipIcon,
  ComputerDesktopIcon,
  TruckIcon, // mașini / camioane
  WrenchScrewdriverIcon, // utilaje
  HomeModernIcon, // imobiliare
  BuildingOffice2Icon,
  GiftIcon,
  TagIcon,
  SparklesIcon,
] as const;

type SliderProps = {
  slides?: Slide[];
  currentSlide?: number;
  isDarkMode?: boolean;
  notifications?: Notification[];
  onPrev?: () => void;
  onNext?: () => void;
};

const FALL_ANIMATIONS = [
  "slider-icon-fall-0",
  "slider-icon-fall-1",
  "slider-icon-fall-2",
  "slider-icon-fall-3",
  "slider-icon-fall-4",
  "slider-icon-fall-5",
  "slider-icon-fall-6",
] as const;

const FIXED_COUNT = 8;
const FALLING_COUNT = 18;

function CategoryIconsLayer() {
  const { fixed, falling } = useMemo(() => {
    const fixed: Array<{
      Icon: (typeof CATEGORY_ICONS)[number];
      left: number;
      top: number;
      size: number;
      opacity: number;
      floatDuration: number;
    }> = [];
    const falling: Array<{
      Icon: (typeof CATEGORY_ICONS)[number];
      left: number;
      size: number;
      opacity: number;
      delay: number;
      duration: number;
      animation: (typeof FALL_ANIMATIONS)[number];
    }> = [];

    for (let i = 0; i < FIXED_COUNT; i++) {
      const seed = i * 0.4183098861837907;
      fixed.push({
        Icon: CATEGORY_ICONS[i % CATEGORY_ICONS.length],
        left: 4 + (seed * 91) % 88,
        top: 8 + (seed * 67) % 78,
        size: 20 + ((seed * 11) % 16),
        opacity: 0.32 + ((seed * 0.4) % 0.38),
        floatDuration: 4.5 + (seed * 2.1) % 2.5,
      });
    }
    for (let i = 0; i < FALLING_COUNT; i++) {
      const seed = (i + 100) * 0.3183098861837907;
      falling.push({
        Icon: CATEGORY_ICONS[(i + 3) % CATEGORY_ICONS.length],
        left: (seed * 97 + (i % 7) * 5.1) % 92,
        size: 14 + ((seed * 17.3) % 14),
        opacity: 0.28 + ((seed * 0.45) % 0.4),
        delay: (seed * 14.2) % 12,
        duration: 20 + ((seed * 9.1) % 12),
        animation: FALL_ANIMATIONS[i % FALL_ANIMATIONS.length],
      });
    }
    return { fixed, falling };
  }, []);

  return (
    <div className="slider-icons-layer pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {fixed.map(({ Icon, left, top, size, opacity, floatDuration }, i) => (
        <div
          key={`f-${i}`}
          className="absolute text-white"
          style={{
            left: `${left}%`,
            top: `${top}%`,
            width: size,
            height: size,
            opacity,
            animation: `slider-icon-float ${floatDuration}s ease-in-out infinite`,
          }}
          aria-hidden
        >
          <Icon className="w-full h-full" strokeWidth={1.2} />
        </div>
      ))}
      {falling.map(({ Icon, left, size, opacity, delay, duration, animation }, i) => (
        <div
          key={`d-${i}`}
          className="absolute left-0 top-0 text-white"
          style={{
            left: `${left}%`,
            width: size,
            height: size,
            opacity,
            animation: `${animation} ${duration}s linear ${delay}s infinite backwards`,
          }}
          aria-hidden
        >
          <Icon className="w-full h-full" strokeWidth={1.2} />
        </div>
      ))}
    </div>
  );
}

const Slider: React.FC<SliderProps> = ({
  slides: slidesProp,
  currentSlide,
  isDarkMode,
  notifications,
  onPrev,
  onNext,
}) => {
  const slidesData = slidesProp && slidesProp.length > 0 ? slidesProp : slides;
  const [internalIndex, setInternalIndex] = useState(0);
  const isControlled =
    typeof currentSlide === "number" &&
    !Number.isNaN(currentSlide) &&
    currentSlide >= 0 &&
    currentSlide < slidesData.length;

  useEffect(() => {
    if (isControlled) {
      return;
    }
    const interval = setInterval(() => {
      setInternalIndex((prev) => (prev + 1) % slidesData.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [isControlled, slidesData.length]);

  useEffect(() => {
    if (!isControlled && internalIndex >= slidesData.length) {
      setInternalIndex(0);
    }
  }, [slidesData.length, internalIndex, isControlled]);

  const activeIndex = isControlled
    ? Math.max(0, Math.min(slidesData.length - 1, currentSlide!))
    : internalIndex;

  const handlePrev = () => {
    if (isControlled) {
      onPrev?.();
    } else {
      setInternalIndex(
        (prev) => (prev - 1 + slidesData.length) % slidesData.length
      );
    }
  };

  const handleNext = () => {
    if (isControlled) {
      onNext?.();
    } else {
      setInternalIndex((prev) => (prev + 1) % slidesData.length);
    }
  };

  return (
    <section className="relative flex min-h-[18vh] sm:min-h-[26vh] md:min-h-[34vh] lg:min-h-[40vh] w-full items-center justify-center pt-3 pb-4 sm:pt-5 sm:pb-6 md:pt-6 md:pb-8 lg:pt-8 lg:pb-10 overflow-hidden">
      {/* Fundal slide-uri */}
      <div className="absolute inset-0 overflow-hidden">
      {slidesData.map((slide, index) => {
        const isActive = index === activeIndex;

        return (
          <div
            key={slide.id}
            className={`absolute inset-0 transition-opacity duration-[1200ms] ease-out ${
              isActive ? "opacity-100" : "opacity-0"
            }`}
            aria-hidden={!isActive}
          >
            {/* First slide = LCP: priority + fetchPriority high; rest lazy. sizes 100vw to avoid 188vw. */}
            <Image
              src={slide.image}
              alt={slide.title}
              fill
              priority={index === 0}
              fetchPriority={index === 0 ? "high" : undefined}
              loading={index === 0 ? undefined : "lazy"}
              sizes="100vw"
              quality={72}
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/50 to-black/30" />
            <div className="absolute inset-0 bg-black/12 backdrop-blur-[1px] md:bg-black/10 md:backdrop-blur-[0.75px]" />
          </div>
        );
      })}
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-xl flex-col items-center justify-center gap-1 sm:gap-2 md:gap-3 px-3 sm:px-4 text-center text-white sm:px-6 min-h-0">
        <span className="text-center text-xs sm:text-[0.65rem] md:text-[0.72rem] font-semibold uppercase tracking-[0.2em] sm:tracking-[0.3em] text-blue-200">
          {slidesData[activeIndex]?.subtitle}
        </span>
        <h1 className="text-center text-xl sm:text-2xl md:text-4xl lg:text-5xl font-extrabold leading-tight tracking-tight max-w-lg mx-auto">
          {slidesData[activeIndex]?.title}
        </h1>
      </div>

      <CategoryIconsLayer />

      <div className="absolute bottom-3 sm:bottom-4 md:bottom-6 left-1/2 z-10 flex -translate-x-1/2 gap-1 sm:gap-1.5 md:gap-2">
        {slidesData.map((slide, index) => (
          <span
            key={slide.id}
            className={`h-1 w-4 sm:h-1.5 sm:w-5 md:w-6 rounded-full transition-all duration-500 ${
              index === activeIndex ? "bg-white" : "bg-white/30"
            }`}
          />
        ))}
      </div>
    </section>
  );
};

export default Slider;


