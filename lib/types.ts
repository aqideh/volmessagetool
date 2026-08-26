export type EventStatus = "active" | "archived";
export type SendStatus = "pending" | "opened" | "sent" | "skipped" | "error";

export interface EventRecord {
  id: string;
  name: string;
  date: string;
  time: string;
  venue: string;
  status: EventStatus;
  createdAt: string;
}

export interface VolunteerRecord {
  id: string;
  eventId: string;
  name: string;
  phone: string;
  role: string;
  fields: Record<string, string>;
  createdAt: string;
}

export interface CampaignRecord {
  id: string;
  eventId: string;
  name: string;
  template: string;
  createdAt: string;
  updatedAt: string;
}

export interface SendRecord {
  id: string;
  eventId: string;
  campaignId: string;
  volunteerId: string;
  status: SendStatus;
  openedAt?: string;
  sentAt?: string;
  updatedAt: string;
}

export interface BackupPayload {
  version: 1;
  exportedAt: string;
  events: EventRecord[];
  volunteers: VolunteerRecord[];
  campaigns: CampaignRecord[];
  sendRecords: SendRecord[];
}
