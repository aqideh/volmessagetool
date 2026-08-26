import Dexie, { type Table } from "dexie";
import type { CampaignRecord, EventRecord, SendRecord, VolunteerRecord } from "./types";

class VolunteerMessageDB extends Dexie {
  events!: Table<EventRecord, string>;
  volunteers!: Table<VolunteerRecord, string>;
  campaigns!: Table<CampaignRecord, string>;
  sendRecords!: Table<SendRecord, string>;

  constructor() {
    super("volunteer-message-tool");
    this.version(1).stores({
      events: "id,status,date,createdAt",
      volunteers: "id,eventId,phone,createdAt,[eventId+phone]",
      campaigns: "id,eventId,updatedAt",
      sendRecords: "id,eventId,campaignId,volunteerId,status,[campaignId+volunteerId]",
    });
  }
}

export const db = new VolunteerMessageDB();
