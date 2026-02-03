"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { gsap } from "gsap";

const TRANSITION_DURATION = 1.8;
const SCROLL_THRESHOLD = 30;
const SECTION2_TOP_THRESHOLD = 10; // переход на героя только когда скролл у самого верха

type HeroScrollTransitionProps = {
  hero: ReactNode;
  section2: ReactNode;
};

export default function HeroScrollTransition({
  hero,
  section2,
}: HeroScrollTransitionProps) {
  const pinRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const savedScrollTopRef = useRef(0);
  const currentSectionRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const touchStartYRef = useRef(0);
  // Переход на героя только после второго скролла вверх в самом верху секции
  const scrollUpAtTopCountRef = useRef(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.history.scrollRestoration = "manual";
      window.scrollTo(0, 0);
    }

    const inner = innerRef.current;
    if (!inner) return;

    const goToSection2 = () => {
      if (isAnimatingRef.current || currentSectionRef.current === 1) return;
      isAnimatingRef.current = true;
      document.body.style.overflow = "hidden";
      window.dispatchEvent(new CustomEvent("lrx:section-changed", { detail: { section: 1 } }));

      gsap.to(inner, {
        y: "-100vh",
        duration: TRANSITION_DURATION,
        ease: "power2.inOut",
        onComplete: () => {
          currentSectionRef.current = 1;
          isAnimatingRef.current = false;
          document.body.style.overflow = "";
          // Восстанавливаем позицию скролла второй секции
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = savedScrollTopRef.current;
          }
        },
      });
    };

    const goToHero = () => {
      if (isAnimatingRef.current || currentSectionRef.current === 0) return;
      isAnimatingRef.current = true;
      // Сохраняем позицию скролла перед уходом на первую секцию
      savedScrollTopRef.current = scrollContainerRef.current?.scrollTop ?? 0;
      document.body.style.overflow = "hidden";
      window.dispatchEvent(new CustomEvent("lrx:section-changed", { detail: { section: 0 } }));

      gsap.to(inner, {
        y: 0,
        duration: TRANSITION_DURATION,
        ease: "power2.inOut",
        onComplete: () => {
          currentSectionRef.current = 0;
          isAnimatingRef.current = false;
          document.body.style.overflow = "";
        },
      });
    };

    const handleWheel = (e: WheelEvent) => {
      if (isAnimatingRef.current) {
        e.preventDefault();
        return;
      }
      if (window.scrollY > SCROLL_THRESHOLD) return;

      if (e.deltaY > 0 && currentSectionRef.current === 0) {
        e.preventDefault();
        goToSection2();
        return;
      }
      // Скролл вниз на второй секции — сбрасываем счётчик «скролл вверх в верху»
      if (e.deltaY > 0 && currentSectionRef.current === 1) {
        scrollUpAtTopCountRef.current = 0;
        return;
      }
      // Скролл вверх на второй секции — переходим на героя только после второго скролла вверх в самом верху
      if (e.deltaY < 0 && currentSectionRef.current === 1) {
        const scrollTop = scrollContainerRef.current?.scrollTop ?? 0;
        if (scrollTop <= SECTION2_TOP_THRESHOLD) {
          scrollUpAtTopCountRef.current += 1;
          if (scrollUpAtTopCountRef.current >= 2) {
            e.preventDefault();
            goToHero();
            scrollUpAtTopCountRef.current = 0;
          } else {
            e.preventDefault();
          }
        } else {
          scrollUpAtTopCountRef.current = 0;
        }
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      touchStartYRef.current = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (isAnimatingRef.current) {
        e.preventDefault();
        return;
      }
      if (window.scrollY > SCROLL_THRESHOLD) return;

      const deltaY = touchStartYRef.current - e.touches[0].clientY;
      if (deltaY > 40 && currentSectionRef.current === 0) {
        e.preventDefault();
        touchStartYRef.current = e.touches[0].clientY;
        goToSection2();
      } else if (deltaY > 40 && currentSectionRef.current === 1) {
        scrollUpAtTopCountRef.current = 0;
      } else if (deltaY < -40 && currentSectionRef.current === 1) {
        const scrollTop = scrollContainerRef.current?.scrollTop ?? 0;
        if (scrollTop <= SECTION2_TOP_THRESHOLD) {
          scrollUpAtTopCountRef.current += 1;
          if (scrollUpAtTopCountRef.current >= 2) {
            e.preventDefault();
            touchStartYRef.current = e.touches[0].clientY;
            goToHero();
            scrollUpAtTopCountRef.current = 0;
          } else {
            e.preventDefault();
          }
        } else {
          scrollUpAtTopCountRef.current = 0;
        }
      }
    };

    const handleGoToSection2 = () => {
      window.scrollTo(0, 0);
      requestAnimationFrame(() => {
        if (currentSectionRef.current === 0) goToSection2();
      });
    };

    const handleGoToHero = () => {
      window.scrollTo(0, 0);
      requestAnimationFrame(() => {
        if (currentSectionRef.current === 1) goToHero();
      });
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("lrx:go-to-section-2", handleGoToSection2);
    window.addEventListener("lrx:go-to-hero", handleGoToHero);

    return () => {
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("lrx:go-to-section-2", handleGoToSection2);
      window.removeEventListener("lrx:go-to-hero", handleGoToHero);
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div ref={pinRef} className="relative w-full h-screen overflow-hidden">
      <div
        ref={innerRef}
        className="will-change-transform"
        style={{ height: "200vh" }}
      >
        <div className="h-screen overflow-hidden">{hero}</div>
        <div className="h-screen min-h-0 overflow-hidden flex flex-col">
          <section className="h-screen flex flex-col bg-[#0F0F0F]">
            <div
              ref={scrollContainerRef}
              className="flex-1 min-h-0 overflow-y-auto py-12 overscroll-contain"
            >
              {section2}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
