"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";

export default function Header() {
  const [currentSection, setCurrentSection] = useState<0 | 1>(0);

  useEffect(() => {
    const handleSectionChanged = (e: Event) => {
      const customEvent = e as CustomEvent<{ section: 0 | 1 }>;
      if (customEvent.detail?.section === 0 || customEvent.detail?.section === 1) {
        setCurrentSection(customEvent.detail.section);
      }
    };
    window.addEventListener("lrx:section-changed", handleSectionChanged);
    return () => window.removeEventListener("lrx:section-changed", handleSectionChanged);
  }, []);

  return (
    <header className="fixed left-0 right-0 top-0 z-20 w-full max-w-[1920px] mx-auto border-b border-white/[0.08] backdrop-blur-md bg-[#0F0F0F]/80">
      <div className="container px-4 sm:px-6 py-4 mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center" aria-label="LRX — на главную">
          <Image
            src="/lrx_logo.png"
            alt="LRX"
            width={112}
            height={81}
            priority
            className="h-8 w-auto md:h-9"
          />
        </Link>
        <nav className="flex items-center gap-1" aria-label="Основная навигация">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("lrx:go-to-hero"))}
            className={`rounded-full px-4 py-2.5 text-sm font-medium transition ${
              currentSection === 0 ? "bg-white/10 text-white" : "text-white/70 hover:text-white hover:bg-white/5"
            }`}
          >
            Главная
          </button>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("lrx:go-to-section-2"))}
            className={`rounded-full px-4 py-2.5 text-sm font-medium transition ${
              currentSection === 1 ? "bg-white/10 text-white" : "text-white/70 hover:text-white hover:bg-white/5"
            }`}
          >
            Конструктор
          </button>
          <a
            href="#contacts"
            className="rounded-full px-4 py-2.5 text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 transition"
          >
            Контакты
          </a>
        </nav>
      </div>
    </header>
  );
}
