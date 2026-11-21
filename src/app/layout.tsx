import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wijaya Express — Ojek Lokal Madiun",
  description:
    "Antar orang, barang, dan makanan di Kota Madiun. Bayar tunai. Tarif Rp 6.000 untuk 2 km pertama, +Rp 3.500 per km berikutnya.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>
        {children}
        <footer className="mx-auto max-w-2xl px-6 pb-8">
          <p className="mt-8 border-t pt-4 text-center text-xs text-slate-500">
            Wijaya Express — ojek lokal Kota Madiun. Bayar tunai. 5 driver.
          </p>
        </footer>
      </body>
    </html>
  );
}
