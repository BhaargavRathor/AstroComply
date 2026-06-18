import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "AstroComply AI — Automated Space Licensing & Regulatory Approval",
  description:
    "AstroComply AI: Autonomous space mission licensing and regulatory approval platform. Powered by UiPath Maestro BPMN, Document Understanding, and LangGraph multi-agent safety auditing.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
