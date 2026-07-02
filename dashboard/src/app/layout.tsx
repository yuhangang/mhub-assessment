import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "MHub Workflow Dashboard",
  description: "Manage, configure, and execute workflows",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-50 bg-[#0b0f19]/80 backdrop-blur-md border-b border-white/5 px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-teal-400 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">MH</div>
            <div>
              <h1 className="font-semibold text-lg text-white leading-none">MHub Workflow</h1>
              <span className="text-[10px] text-teal-400 font-medium tracking-widest uppercase">Admin Engine</span>
            </div>
          </div>
          <nav className="flex gap-6 text-sm font-medium text-slate-300">
            <Link href="/" className="hover:text-indigo-400 transition-colors">Overview</Link>
            <Link href="/templates" className="hover:text-indigo-400 transition-colors">Configuration</Link>
            <Link href="/trigger" className="hover:text-indigo-400 transition-colors">Run Process</Link>
            <Link href="/inbox" className="hover:text-indigo-400 transition-colors">Inbox Simulator</Link>
          </nav>
        </header>
        <main className="flex-1 max-w-7xl w-full mx-auto p-6">
          {children}
        </main>
      </body>
    </html>
  );
}
