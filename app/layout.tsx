import type { Metadata } from "next";
import "@mantine/core/styles.css";
import "./globals.css";
import "./name-preference-toggle.css";
import "./general-messaging.css";
import "./sidebar-fix.css";
import "./mantine-bridge.css";
import Providers from "./providers";
import EventWorkspaceTools from "./event-workspace-tools";
import NewEventFormTools from "./new-event-form-tools";
import RosterTemplateDownload from "./roster-template-download";
import MessageTemplateTools from "./message-template-tools";
import ShiftPocTools from "./shift-poc-tools";
import MessageVariableReference from "./message-variable-reference";
import FloatingToolsMenu from "./floating-tools-menu";

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
          <NewEventFormTools />
          <RosterTemplateDownload />
          <MessageTemplateTools />
          <MessageVariableReference />
          <ShiftPocTools />
          <FloatingToolsMenu />
          {children}
        </Providers>
      </body>
    </html>
  );
}
