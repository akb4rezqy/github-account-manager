import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stock Manager",
  description: "Secure account stock management dashboard",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="id"><body>{children}</body></html>;
}
