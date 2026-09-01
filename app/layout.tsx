import type { Metadata } from "next";
import "./globals.css";
import "./name-preference-toggle.css";
import "./general-messaging.css";
import NamePreferenceToggle from "./name-preference-toggle";

export const metadata: Metadata = {
  title: "Volunteer Message Tool",
  description: "Local-first volunteer roster and WhatsApp messaging assistant",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="floating-tools">
          <NamePreferenceToggle />
          <a className="general-messages-shortcut" href="/general">General messages</a>
          <a className="general-messages-shortcut" href="/roster-flags">Roster flags</a>
          <a className="event-settings-shortcut" href="/event-details">Event links</a>
        </div>
        {children}
      </body>
    </html>
  );
}
