import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Нарзаалай — нарны эрчим хүчний платформ", template: "%s · Нарзаалай" },
  description: "Өрх болон бизнесийн нарны эрчим хүчний үнэлгээ, үнийн санал харьцуулалт, суурилуулалтын төслийг нэг дор зохицуулах платформ.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b1f3a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mn">
      <body className="min-h-screen antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-sun-400 focus:px-4 focus:py-2 focus:text-navy-950">
          Үндсэн агуулга руу очих
        </a>
        {children}
      </body>
    </html>
  );
}
