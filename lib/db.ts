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

const SEND_STATUS_RANK: Record<SendRecord["status"], number> = {
  pending: 0,
  opened: 1,
  skipped: 2,
  error: 2,
  sent: 3,
};

function sendRecordKey(record: Pick<SendRecord, "campaignId" | "volunteerId">): string {
  return `${record.campaignId}\u0000${record.volunteerId}`;
}

function newerSendRecord(a: SendRecord, b: SendRecord): SendRecord {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return SEND_STATUS_RANK[a.status] >= SEND_STATUS_RANK[b.status] ? a : b;
}

function dedupeSendRecords(records: SendRecord[]): SendRecord[] {
  const latest = new Map<string, SendRecord>();
  for (const record of records) {
    const key = sendRecordKey(record);
    const current = latest.get(key);
    latest.set(key, current ? newerSendRecord(current, record) : record);
  }
  return [...latest.values()];
}

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

    // Repair any duplicate event-send rows created by stale UI state during rapid
    // Opened -> Sent transitions. Keep the most recently updated row per campaign/person.
    this.version(5)
      .stores({
        events: "id,status,date,createdAt",
        shifts: "id,eventId,date,startTime,createdAt,[eventId+name]",
        volunteers: "id,eventId,phone,createdAt,[eventId+phone]",
        assignments: "id,eventId,shiftId,volunteerId,createdAt,[shiftId+volunteerId]",
        campaigns: "id,eventId,updatedAt,status,audienceType,shiftId",
        sendRecords: "id,eventId,campaignId,volunteerId,status,[campaignId+volunteerId]",
        generalCampaigns: "id,updatedAt,status,createdAt",
        generalRecipients: "id,campaignId,phone,createdAt,[campaignId+phone]",
        generalSendRecords: "id,campaignId,recipientId,status,[campaignId+recipientId]",
      })
      .upgrade(async (tx) => {
        const table = tx.table("sendRecords");
        const existing = (await table.toArray()) as SendRecord[];
        const repaired = dedupeSendRecords(existing);
        if (repaired.length !== existing.length) {
          await table.clear();
          if (repaired.length) await table.bulkAdd(repaired);
        }
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

    // The compound index is not unique in the legacy schema, so enforce one logical
    // record per campaign/person in the table API itself. This also prevents two rapid
    // status writes from creating separate rows when React state has not refreshed yet.
    const rawSendRecords = this.table<SendRecord, string>("sendRecords");
    const db = this;
    this.sendRecords = new Proxy(rawSendRecords, {
      get(target, property) {
        if (property === "put") {
          return async (incoming: SendRecord) => db.transaction("rw", rawSendRecords, async () => {
            const matches = await rawSendRecords
              .where("[campaignId+volunteerId]")
              .equals([incoming.campaignId, incoming.volunteerId])
              .toArray();

            const current = dedupeSendRecords(matches)[0];
            const winner = current ? newerSendRecord(current, incoming) : incoming;
            const canonicalId = current?.id || incoming.id;
            const canonical = { ...winner, id: canonicalId };

            const duplicateIds = matches.filter((record) => record.id !== canonicalId).map((record) => record.id);
            if (duplicateIds.length) await rawSendRecords.bulkDelete(duplicateIds);
            return rawSendRecords.put(canonical);
          });
        }

        if (property === "toArray") {
          return async () => dedupeSendRecords(await rawSendRecords.toArray());
        }

        if (property === "bulkAdd") {
          return async (records: SendRecord[]) => rawSendRecords.bulkAdd(dedupeSendRecords(records));
        }

        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as Table<SendRecord, string>;
  }
}

export const db = new VolunteerMessageDB();