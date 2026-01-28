export type Role = "Admin" | "AccountsOfficer" | "Manager" | "Director" | "Auditor";
export type DocStatus = "draft" | "submitted" | "approved" | "posted" | "voided";
export type PermissionAction =
  | "VIEW"
  | "CREATE"
  | "EDIT"
  | "DELETE_DRAFT"
  | "SUBMIT"
  | "POST"
  | "VOID"
  | "REVERSE";

type PermissionResult = { allowed: boolean; reason?: string };

const deny = (reason: string): PermissionResult => ({ allowed: false, reason });

export const canPerform = (
  role: Role,
  status: DocStatus | null,
  action: PermissionAction
): PermissionResult => {
  if (action === "VIEW") {
    return { allowed: true };
  }

  const isDraft = status === "draft";
  const isSubmitted = status === "submitted";
  const isPosted = status === "posted";

  switch (role) {
    case "Admin": {
      if (action === "VOID" || action === "REVERSE") {
        return isPosted
          ? { allowed: true }
          : deny("Only posted documents can be voided or reversed.");
      }
      if (action === "DELETE_DRAFT") {
        return isDraft
          ? { allowed: true }
          : deny("Only draft documents can be deleted.");
      }
      if (action === "EDIT") {
        return isDraft
          ? { allowed: true }
          : deny("Only draft documents can be edited.");
      }
      if (action === "SUBMIT") {
        return isDraft
          ? { allowed: true }
          : deny("Only draft documents can be submitted.");
      }
      if (action === "POST") {
        return isSubmitted
          ? { allowed: true }
          : deny("Only submitted documents can be posted.");
      }
      return { allowed: true };
    }
    case "AccountsOfficer": {
      if (action === "CREATE" || action === "EDIT") {
        return { allowed: true };
      }
      if (action === "DELETE_DRAFT") {
        return isDraft
          ? { allowed: true }
          : deny("Only draft documents can be deleted.");
      }
      if (action === "SUBMIT") {
        return isDraft
          ? { allowed: true }
          : deny("Only draft documents can be submitted.");
      }
      return deny("You can submit but not post or void.");
    }
    case "Manager": {
      if (action === "POST") {
        return isSubmitted
          ? { allowed: true }
          : deny("Only submitted documents can be posted.");
      }
      if (action === "VOID" || action === "REVERSE") {
        return isPosted
          ? { allowed: true }
          : deny("Only posted documents can be voided or reversed.");
      }
      return deny("You have view and posting rights only.");
    }
    case "Director":
    case "Auditor": {
      return deny("View-only role.");
    }
    default:
      return deny("Role not permitted.");
  }
};

export const canAnyRole = (
  roles: Role[],
  status: DocStatus | null,
  action: PermissionAction
): PermissionResult => {
  for (const role of roles) {
    const result = canPerform(role, status, action);
    if (result.allowed) {
      return result;
    }
  }
  const fallbackRole = roles[0] ?? "Auditor";
  const result = canPerform(fallbackRole, status, action);
  return {
    allowed: false,
    reason: result.reason ?? "Not permitted.",
  };
};
