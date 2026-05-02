import Image from "next/image";

/**
 * Server Component: above-the-fold hero for LCP.
 * LCP image: next/image priority + fetchPriority (no duplicate <link rel="preload"> in root layout).
 * No client JS; no slider/carousel on initial load.
 */
const LCP_HERO_SRC = "/images/slider/slider-3-real-estate.jpg";

export default function HomeHeroServer() {
  return (
    <section
      className="relative flex min-h-[18vh] sm:min-h-[26vh] md:min-h-[34vh] lg:min-h-[40vh] w-full items-center justify-center pt-3 pb-4 sm:pt-5 sm:pb-6 md:pt-6 md:pb-8 lg:pt-8 lg:pb-10 overflow-hidden"
      aria-label="Hero licitații"
    >
      <div className="absolute inset-0">
        <Image
          src={LCP_HERO_SRC}
          alt="Imobiliare de Excepție - gobid.ro"
          fill
          priority
          fetchPriority="high"
          sizes="100vw"
          quality={75}
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/50 to-black/30" />
      </div>
      <div className="relative z-10 mx-auto flex w-full max-w-xl flex-col items-center justify-center gap-1 sm:gap-2 md:gap-3 px-3 sm:px-4 text-center text-white sm:px-6">
        <span className="text-xs sm:text-[0.65rem] md:text-[0.72rem] font-semibold uppercase tracking-[0.2em] sm:tracking-[0.3em] text-blue-200">
          Marketplace premium
        </span>
        <h1 className="text-xl sm:text-2xl md:text-4xl lg:text-5xl font-extrabold leading-tight tracking-tight max-w-lg mx-auto">
          Descoperă licitații exclusive
        </h1>
      </div>
    </section>
  );
}
