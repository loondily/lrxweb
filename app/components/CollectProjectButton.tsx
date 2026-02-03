"use client";

export default function CollectProjectButton() {
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(new CustomEvent("lrx:go-to-section-2"));
      }}
      className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-[#0F0F0F] transition hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white/30 cursor-pointer"
    >
      Собрать проект
    </button>
  );
}
