import { db } from "@/db";
import { events } from "@/db/schema";

/** One line in the workspace's record. Never throws into the caller: the action is the point. */
export async function audit(workspaceId: string, agentId: string | null, type: string, detail = "") {
  await db.insert(events).values({ workspaceId, agentId, type, detail });
}
