import type { Metadata } from "next";
import { Changa, Tajawal } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "700", "800"],
});

const changa = Changa({
  variable: "--font-changa",
  subsets: ["arabic", "latin"],
  weight: ["500", "600", "700", "800"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "RestaurantFlow POS | إدارة المطاعم والكافيهات";
  const description = "نظام كاشير ومخزون وتصنيع وتكلفة للمطاعم والكافيهات";
  return {
    metadataBase: new URL(origin),
    title,
    description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title,
      description,
      locale: "ar_EG",
      type: "website",
      images: [{ url: `${origin}/og-v2.png`, width: 1200, height: 630, alt: "RestaurantFlow POS — خطوة بخطوة" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [`${origin}/og-v2.png`] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`${tajawal.variable} ${changa.variable} antialiased`}>{children}</body>
    </html>
  );
}
