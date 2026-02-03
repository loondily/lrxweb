"use client";

import { useRef, useState, useEffect } from "react";

const MIN_CHARS_FOR_BUTTON = 5;
const INPUT_CLASS =
  "w-full min-h-16 bg-transparent border-none outline-none text-white text-3xl placeholder:text-white/40 font-light resize-none overflow-hidden";

export default function SecondSectionForm() {
  const [value, setValue] = useState("");
  const [buttonStyle, setButtonStyle] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLSpanElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const showButton = value.trim().length > MIN_CHARS_FOR_BUTTON;

  useEffect(() => {
    if (!showButton || !containerRef.current || !endRef.current || !measureRef.current) {
      setButtonStyle(null);
      return;
    }
    const container = containerRef.current.getBoundingClientRect();
    const end = endRef.current.getBoundingClientRect();
    setButtonStyle({
      top: end.bottom - container.top + 12,
      left: end.left - container.left,
    });
  }, [value, showButton]);

  useEffect(() => {
    const measure = measureRef.current;
    const ta = textareaRef.current;
    if (!measure || !ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.max(measure.offsetHeight, 64)}px`;
  }, [value]);

  return (
    <div ref={containerRef} className="relative w-full pt-10">
      {/* Слой для измерения конца текста — тот же шрифт и ширина */}
      <div
        ref={measureRef}
        className={`${INPUT_CLASS} pointer-events-none invisible whitespace-pre-wrap break-words`}
        aria-hidden
      >
        {value || " "}
        <span ref={endRef} className="inline-block w-0 overflow-hidden">
          &#8203;
        </span>
      </div>

      {/* Поле ввода поверх */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Введите текст..."
        rows={1}
        className={`${INPUT_CLASS} absolute top-10 left-0 right-0`}
        style={{ caretColor: "white" }}
        aria-label="Описание сайта или сервиса"
      />

      {/* Кнопка под последним символом */}
      {showButton && buttonStyle && (
        <button
          type="button"
          className="absolute z-10 cursor-pointer rounded-full bg-white px-8 py-4 text-base font-semibold text-[#0F0F0F] transition hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white/50 whitespace-nowrap"
          style={{
            top: buttonStyle.top,
            left: buttonStyle.left,
            animation: "button-appear 0.35s ease-out forwards",
          }}
        >
          AI собрать проект
        </button>
      )}
    </div>
  );
}
