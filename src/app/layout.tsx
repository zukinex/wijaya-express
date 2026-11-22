import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "Wijaya Express — Ojek Lokal Nganjuk & Jombang",
  description:
    "Antar orang, barang, dan makanan di Nganjuk dan Jombang. Bayar tunai. Tarif Rp 6.000 untuk 2 km pertama, +Rp 3.500 per km berikutnya.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Wijaya Express",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#16a34a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>
        <ServiceWorkerRegister />
        {children}
        <footer className="mx-auto max-w-2xl px-6 pb-8">
          <p className="mt-8 border-t pt-4 text-center text-xs text-slate-500">
            Wijaya Express — ojek lokal Nganjuk & Jombang. Bayar tunai. 5 driver.
          </p>
        </footer>
      </body>
    </html>
  );
}
