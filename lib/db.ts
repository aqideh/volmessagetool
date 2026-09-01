import Dexie, { type Table } from "dexie";
import type {
  AssignmentRecord,
  CampaignRecord,
  EventRecord,
  GeneralCampaignRecord,
  GeneralRecipientRecord,
  GeneralSendRecord,
  SendRecord,
  ShiftRecord,
  VolunteerRecord,
} from "./types";
import { titleCaseName } from "./name";

class VolunteerMessageDB extends Dexie {
  events!: Table<EventRecord, string>;
  shifts!: Table<ShiftRecord, string>;
  volunteers!: Table<VolunteerRecord, string>;
  assignments!: Table<AssignmentRecord, string>;
  campaigns!: Table<CampaignRecord, string>;
  sendRecords!: Table<SendRecord, string>;
  generalCampaigns!: Table<GeneralCampaignRecord, string>;
  generalRecipients!: Table<GeneralRecipientRecord, string>;
  generalSendRecords!: Table<GeneralSendRecord, string>;

  constructor() {
    super("volunteer-message-tool");

    this.version(1).stores({
      events: "id,status,date,createdAt",
      volunteers: "id,eventId,phone,createdAt,[eventId+phone]",
      campaigns: "id,eventId,updatedAt",
      sendRecords: "id,eventId,campaignId,volunteerId,status,[campaignId+volunteerId]",
    });

    this.version(2)
      .stores({
        events: "id,status,date,createdAt",
        shifts: "id,eventId,date,startTime,createdAt,[eventId+name]",
        volunteers: "id,eventId,phone,createdAt,[eventId+phone]",
        assignments: "id,eventId,shiftId,volunteerId,createdAt,[shiftId+volunteerId]",
        campaigns: "id,eventId,updatedAt,status,audienceType,shiftId",
        sendRecords: "id,eventId,campaignId,volunteerId,status,[campaignId+volunteerId]",
      })
      .upgrade(async (tx) => {
        const events = (await tx.table("events").toArray()) as EventRecord[];
        const volunteers = (await tx.table("volunteers").toArray()) as VolunteerRecord[];
        const now = new Date().toISOString();
        const shifts: ShiftRecord[] = [];
        const assignments: AssignmentRecord[] = [];

        for (const event of events) {
          const shiftId = `legacy-main-${event.id}`;
          shifts.push({
            id: shiftId,
            eventId: event.id,
            name: "Main Shift",
            date: event.date,
            startTime: event.time,
            endTime: "",
            reportingTime: event.time,
            venue: event.venue,
            notes: "Created automatically when upgrading from the original single-shift data model.",
            createdAt: now,
          });

          for (const volunteer of volunteers.filter((item) => item.eventId === event.id)) {
            assignments.push({
              id: `legacy-assignment-${volunteer.id}`,
              eventId: event.id,
              shiftId,
              volunteerId: volunteer.id,
              role: volunteer.role || "",
              createdAt: volunteer.createdAt || now,
            });
          }
        }

        if (shifts.length) await tx.table("shifts").bulkAdd(shifts);
        if (assignments.length) await tx.table("assignments").bulkAdd(assignments);

        await tx.table("campaigns").toCollection().modify((campaign: Partial<CampaignRecord>) => {
          campaign.audienceType = campaign.audienceType || "event";
          campaign.status = campaign.status || "active";
        });
      });

    this.version(3)
      .stores({
        events: "id,status,date,createdAt",
        shifts: "id,eventId,date,startTime,createdAt,[eventId+name]",
        volunteers: "id,eventId,phone,createdAt,[eventId+phone]",
        assignments: "id,eventId,shiftId,volunteerId,createdAt,[shiftId+volunteerId]",
        campaigns: "id,eventId,updatedAt,status,audienceType,shiftId",
        sendRecords: "id,eventId,campaignId,volunteerId,status,[campaignId+volunteerId]",
      })
      .upgrade(async (tx) => {
        await tx.table("volunteers").toCollection().modify((volunteer: VolunteerRecord) => {
          volunteer.name = titleCaseName(volunteer.name);
        });
      });

    this.version(4).stores({
      events: "id,status,date,createdAt",
      shifts: "id,eventId,date,startTime,createdAt,[eventId+name]",
      volunteers: "id,eventId,phone,createdAt,[eventId+phone]",
      assignments: "id,eventId,shiftId,volunteerId,createdAt,[shiftId+volunteerId]",
      campaigns: "id,eventId,updatedAt,status,audienceType,shiftId",
      sendRecords: "id,eventId,campaignId,volunteerId,status,[campaignId+volunteerId]",
      generalCampaigns: "id,updatedAt,status,createdAt",
      generalRecipients: "id,campaignId,phone,createdAt,[campaignId+phone]",
      generalSendRecords: "id,campaignId,recipientId,status,[campaignId+recipientId]",
    });

    this.volunteers.hook("creating", (_primaryKey, volunteer) => {
      volunteer.name = titleCaseName(volunteer.name);
    });

    this.volunteers.hook("updating", (changes) => {
      const volunteerChanges = changes as Partial<VolunteerRecord>;
      if (typeof volunteerChanges.name === "string") {
        volunteerChanges.name = titleCaseName(volunteerChanges.name);
      }
    });

    this.generalRecipients.hook("creating", (_primaryKey, recipient) => {
      recipient.name = titleCaseName(recipient.name);
    });

    this.generalRecipients.hook("updating", (changes) => {
      const recipientChanges = changes as Partial<GeneralRecipientRecord>;
      if (typeof recipientChanges.name === "string") {
        recipientChanges.name = titleCaseName(recipientChanges.name);
      }
    });
  }
}

export const db = new VolunteerMessageDB();
