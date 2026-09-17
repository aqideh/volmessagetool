import type { AssignmentRecord, ShiftRecord } from "./types";

function assignmentKey(assignment: Pick<AssignmentRecord, "volunteerId" | "shiftId">): string {
  return `${assignment.volunteerId}\u0000${assignment.shiftId}`;
}

function preferredAssignment(a: AssignmentRecord, b: AssignmentRecord): AssignmentRecord {
  const newer = a.createdAt >= b.createdAt ? a : b;
  const older = newer === a ? b : a;

  // Keep the newest record, but do not lose a useful role if the newer duplicate
  // was accidentally created without one.
  if (!newer.role.trim() && older.role.trim()) return { ...newer, role: older.role };
  return newer;
}

/**
 * Returns one canonical assignment per volunteer + shift pair.
 */
export function dedupeAssignments(assignments: AssignmentRecord[]): AssignmentRecord[] {
  const unique = new Map<string, AssignmentRecord>();
  for (const assignment of assignments) {
    const key = assignmentKey(assignment);
    const current = unique.get(key);
    unique.set(key, current ? preferredAssignment(current, assignment) : assignment);
  }
  return [...unique.values()];
}

/**
 * Returns a volunteer's distinct assignments. When shifts are supplied, orphaned
 * assignments that do not point at a current shift are excluded.
 */
export function assignmentsForVolunteer(
  assignments: AssignmentRecord[],
  volunteerId: string,
  shifts?: ShiftRecord[],
): AssignmentRecord[] {
  const validShiftIds = shifts ? new Set(shifts.map((shift) => shift.id)) : undefined;
  return dedupeAssignments(
    assignments.filter(
      (assignment) =>
        assignment.volunteerId === volunteerId &&
        (!validShiftIds || validShiftIds.has(assignment.shiftId)),
    ),
  );
}

/**
 * A multi-shift volunteer is someone assigned to at least two distinct, current
 * shifts. Duplicate rows and assignments to missing shifts never qualify them.
 */
export function multiShiftVolunteerIds(
  assignments: AssignmentRecord[],
  shifts: ShiftRecord[],
): string[] {
  const validShiftIds = new Set(shifts.map((shift) => shift.id));
  const shiftsByVolunteer = new Map<string, Set<string>>();

  for (const assignment of dedupeAssignments(assignments)) {
    if (!validShiftIds.has(assignment.shiftId)) continue;
    const shiftIds = shiftsByVolunteer.get(assignment.volunteerId) ?? new Set<string>();
    shiftIds.add(assignment.shiftId);
    shiftsByVolunteer.set(assignment.volunteerId, shiftIds);
  }

  return [...shiftsByVolunteer.entries()]
    .filter(([, shiftIds]) => shiftIds.size >= 2)
    .map(([volunteerId]) => volunteerId);
}
