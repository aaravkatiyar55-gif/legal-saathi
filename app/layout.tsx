import type { Metadata } from "next";
import "./globals.css";
import PlanStateProvider from "@/components/PlanStateProvider";
import AppErrorProvider from "@/components/AppErrorProvider";

export const metadata: Metadata = {
  title: "Legal Saathi | India-focused legal information and preparation",
  description: "An India-focused workspace for legal information, document understanding, and case preparation. Legal Saathi does not provide legal representation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <AppErrorProvider>
          <PlanStateProvider>{children}</PlanStateProvider>
        </AppErrorProvider>
      </body>
    </html>
  );
}
