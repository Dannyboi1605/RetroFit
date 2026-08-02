import type { Metadata } from "next";
import { Anybody, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const anybody = Anybody({ subsets: ["latin"], variable: "--font-anybody" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "RetroFit 8-Bit",
  description: "8-bit calorie and macro tracker",
  manifest: "/manifest.webmanifest",
  icons: [{ rel: "icon", url: "/RF logo.png" }],
  appleWebApp: {
    capable: true,
    title: "RetroFit 8-Bit",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${anybody.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
