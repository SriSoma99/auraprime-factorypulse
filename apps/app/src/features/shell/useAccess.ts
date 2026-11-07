// The signed-in role's screen access, for hiding links and disabling actions (ADR-040). The API enforces the same rules.
import { useSession } from "@/lib/session";
import { canUse, canView, type Screen } from "./access";

export function useAccess() {
  const p = useSession().session?.permissions;
  return { canView: (sc: Screen) => canView(p, sc), canUse: (sc: Screen) => canUse(p, sc) };
}

export const VIEW_ONLY_NOTE = "View only for your role.";
