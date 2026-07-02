import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

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
      <body className="min-h-screen flex flex-col bg-[#080b11] text-white">
        <Navbar />
        <main className="flex-1 max-w-7xl w-full mx-auto p-6">
          {children}
        </main>
      </body>
    </html>
  );
}
