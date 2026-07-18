import type { Metadata } from "next";

import "./globals.css";
import { AppProviders } from "../components/providers/AppProviders";

export const metadata: Metadata = {
  title: "Idempotent Payments Lab",
  description: "Production-style payment processing simulator focused on idempotency and operational correctness.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
