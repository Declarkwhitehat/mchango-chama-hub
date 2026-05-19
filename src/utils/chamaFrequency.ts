export function frequencyLabel(
  frequency: string | null | undefined,
  everyNDaysCount?: number | null,
): string {
  switch (frequency) {
    case "daily":
      return "Daily";
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    case "twice_monthly":
      return "Twice Monthly";
    case "every_n_days":
      return everyNDaysCount && everyNDaysCount > 0
        ? `Every ${everyNDaysCount} Days`
        : "Every N Days";
    default:
      return frequency ? frequency.replace(/_/g, " ") : "Contribution";
  }
}
