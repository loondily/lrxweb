export default function Footer() {
  return (
    <footer id="contacts" className="border-t border-white/[0.08] mt-auto bg-[#0F0F0F] pb-[env(safe-area-inset-bottom)]">
      <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <p className="text-sm text-white/50 text-center">
          © {new Date().getFullYear()} LRX. Веб-студия.
        </p>
      </div>
    </footer>
  );
}
