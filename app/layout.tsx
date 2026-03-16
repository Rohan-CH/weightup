import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WeightUp — Track Your Gains",
  description: "Futuristic workout tracker with progress dashboards, leaderboards, and exercise tracking.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
