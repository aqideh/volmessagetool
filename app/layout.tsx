import type { Metadata } from "next";
import "@mantine/core/styles.css";
import "./globals.css";
import "./name-preference-toggle.css";
import "./general-messaging.css";
import "./sidebar-fix.css";
import "./mantine-bridge.css";
import Providers from "./providers";
import NamePreferenceToggle from "./name-preference-toggle";
import EventWorkspaceTools from "./event-workspace-tools";

export const metadata: Metadata = {
  title: "Volunteer Message Tool",
  description: "Local-first volunteer roster and WhatsApp messaging assistant",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <EventWorkspaceTools />
          <div className="floating-tools">
            <NamePreferenceToggle />
            <a className="general-messages-shortcut" href="/general">General messages</a>
            <a className="general-messages-shortcut" href="/roster-flags">Roster flags</a>
          </div>
          {children}
        </Providers>
      </body>
    </html>
  );
}
