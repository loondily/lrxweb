import Image from "next/image";
import HeroScrollTransition from "./components/HeroScrollTransition";
import AIProjectBuilder from "./components/AIProjectBuilder";
import CollectProjectButton from "./components/CollectProjectButton";

const HEADER_HEIGHT = 90; // высота шапки для отступа героя

function HeroSection() {
  return (
    <section
      className="relative h-screen"
      style={{ paddingTop: `${HEADER_HEIGHT}px` }}
    >
      {/* Левая часть — картинка на всю высоту секции (включая область под шапкой) */}
      <div className="absolute left-0 top-0 z-0 h-full w-1/2">
        <Image
          src="/img/hero_abstract.png"
          alt=""
          fill
          className="object-cover object-left"
          sizes="50vw"
          priority
        />
        <div
          className="absolute inset-0 bg-[#0F0F0F]/20 backdrop-blur-sm"
          aria-hidden
        />
        <div
          className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-[#0F0F0F] to-transparent pointer-events-none"
          aria-hidden
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-[#0F0F0F] to-transparent pointer-events-none"
          aria-hidden
        />
      </div>

      <div
        className="relative z-10 flex items-center justify-between gap-12 px-20"
        style={{ minHeight: `calc(100vh - ${HEADER_HEIGHT}px)` }}
      >
        <div className="max-w-xl">
          <h1 className="font-extrabold text-4xl md:text-5xl leading-tight text-white tracking-tight">
            Соберите свой сайт за 5 минут —
            <br />
            узнайте реальную стоимость сразу
          </h1>
          <p className="mt-6 text-lg text-white/70 font-light max-w-md">
            AI-конструктор сайтов и веб-сервисов
            с прозрачной архитектурой и ценой
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <CollectProjectButton />
            <a
              href="#"
              className="inline-flex items-center justify-center rounded-full border border-white/30 bg-transparent px-8 py-4 text-base font-semibold text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/30"
            >
              Как это работает
            </a>
          </div>
        </div>
        <Image
          src="/img/hero_lrx.png"
          alt="LRX"
          width={603}
          height={570}
          priority
          className="shrink-0 opacity-90"
        />
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <main className="flex-1 bg-[#0F0F0F]">
      <HeroScrollTransition
        hero={<HeroSection />}
        section2={
          <div className="w-full px-6 sm:px-10 lg:px-20 py-30 text-left">
            <AIProjectBuilder />
          </div>
        }
      />

      <section className="container mx-auto px-4 py-16 pt-[90px]">
        {/* Секция 3 — обычный скролл */}
      </section>
    </main>
  );
}
