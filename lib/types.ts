export type EventStatus = "active" | "archived";
export type SendStatus = "pending" | "opened" | "sent" | "skipped" | "error";
export type CampaignAudienceType = "event" | "shift";
export type CampaignStatus = "active" | "closed";

export interface EventRecord {
  id: string;
  name: string;
  date: string;
  time: string;
  venue: string;
  briefingLink?: string;
  whatsappGroupLink?: string;
  status: EventStatus;
  createdAt: string;
}

export interface ShiftRecord {
  id: string;
  eventId: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  reportingTime: string;
  venue: string;
  notes: string;
  createdAt: string;
}

export interface VolunteerRecord {
  id: string;
  eventId: string;
  name: string;
  phone: string;
  /** Legacy field retained only for backup/data compatibility. New roles belong to assignments. */
  role: string;
  fields: Record<string, string>;
  createdAt: string;
}

export interface AssignmentRecord {
  id: string;
  eventId: string;
  shiftId: string;
  volunteerId: string;
  role: string;
  createdAt: string;
}

export interface CampaignRecord {
  id: string;
  eventId: string;
  name: string;
  template: string;
  audienceType: CampaignAudienceType;
  shiftId?: string;
  status: CampaignStatus;
  recipientIds?: string[];
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
  version: 2;
  exportedAt: string;
  events: EventRecord[];
  shifts: ShiftRecord[];
  volunteers: VolunteerRecord[];
  assignments: AssignmentRecord[];
  campaigns: CampaignRecord[];
  sendRecords: SendRecord[];
}

export interface LegacyBackupPayload {
  version: 1;
  exportedAt: string;
  events: EventRecord[];
  volunteers: VolunteerRecord[];
  campaigns: Array<{
    id: string;
    eventId: string;
    name: string;
    template: string;
    createdAt: string;
    updatedAt: string;
  }>;
  sendRecords: SendRecord[];
}
