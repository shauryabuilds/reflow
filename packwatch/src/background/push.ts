// Pro alert channels (milestone 7). Free plans get nothing here.
import type { Plan, Priority, Settings } from "../shared/types";
import type { PendingAlert } from "./process";

export async function pushChannels(_a: PendingAlert, _plan: Plan, _s: Settings, _p: Priority): Promise<string[]> {
  return [];
}
