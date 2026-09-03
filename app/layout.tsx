import type { Metadata } from "next";
import "./globals.css";
import "./name-preference-toggle.css";
import "./general-messaging.css";
import "./sidebar-fix.css";
import NamePreferenceToggle from "./name-preference-toggle";
import SidebarEventSearch from "./sidebar-event-search";

export const metadata: Metadata = {
  title: "Volunteer Message Tool",
  description: "Local-first volunteer roster and WhatsApp messaging assistant",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SidebarEventSearch />
        <div className="floating-tools">
          <NamePreferenceToggle />
          <a className="general-messages-shortcut" href="/general">General messages</a>
          <a className="general-messages-shortcut" href="/roster-flags">Roster flags</a>
          <a className="event-settings-shortcut" href="/event-details">Event details</a>
        </div>
        {children}
      </body>
    </html>
  );
}
