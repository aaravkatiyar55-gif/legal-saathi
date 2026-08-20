import type { Metadata } from "next";
import "./globals.css";
import PlanStateProvider from "@/components/PlanStateProvider";
import AppErrorProvider from "@/components/AppErrorProvider";

export const metadata: Metadata = {
  title: "Legal Saathi - Your AI Legal Companion",
  description: "An Indian legal-information workspace for preparing questions and understanding safer next steps in English, Hindi, and Hinglish.",
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
