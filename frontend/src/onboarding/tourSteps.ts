// First-run onboarding tour — step definitions.
//
// Each step navigates the user to the real screen for a core feature and shows
// a coaching card explaining what to do ("watch" mode — the user reads, then
// taps NEXT). Two steps deep-link into a sample record (a tool / a dealer) when
// the demo data provides one, otherwise they fall back to the relevant list.

export type TourStep = {
  key: string;
  title: string;
  body: string;
  icon: any; // Ionicons glyph name
  route: string; // expo-router path to navigate to for this step
  hint?: string; // short "where to look / what to tap" pointer
};

export function buildTourSteps(opts: { toolId?: string; dealerId?: string }): TourStep[] {
  const { toolId, dealerId } = opts;
  return [
    {
      key: "add-item",
      title: "Add an item or a set",
      body:
        "Tap the + button to add a new tool. From there you can also choose " +
        "“Add Set / Bundle” to group several tools together under one set price.",
      icon: "add-circle",
      route: "/(tabs)/inventory",
      hint: "Look for the round + button, bottom-right.",
    },
    {
      key: "mark-broken",
      title: "Mark an item as broken",
      body:
        "Open any item and use its Status / Condition section to flag it as " +
        "Broken, Lost or Stolen — your inventory and reports always stay accurate.",
      icon: "construct",
      route: toolId ? `/tool/${toolId}` : "/(tabs)/inventory",
      hint: toolId
        ? "Scroll to the “Status / Lost & Broken” section."
        : "Open any item to find its Status options.",
    },
    {
      key: "dealer-agent",
      title: "Set the current dealer agent",
      body:
        "Open a dealer to add or switch the current agent (your rep). Payments, " +
        "routes and tools purchased are then tracked against the right person.",
      icon: "person-add",
      route: dealerId ? `/dealer/${dealerId}` : "/(tabs)/dealers",
      hint: dealerId
        ? "Find the “Agents” section and add or set the current one."
        : "Open any dealer to manage its agents.",
    },
    {
      key: "personal-data",
      title: "Add your personal details",
      body:
        "Enter your name and contact info. It’s printed as the “Prepared for” " +
        "letterhead on your PDF reports, so they look professional for insurers.",
      icon: "id-card",
      route: "/personal-info",
      hint: "Fill in the fields, then tap Save.",
    },
    {
      key: "insurance-report",
      title: "Run an insurance inventory report",
      body:
        "Generate a polished PDF of your entire inventory for your insurer. Pick " +
        "the Insurance report and tap Generate — it includes values and photos.",
      icon: "document-text",
      route: "/(tabs)/reports",
      hint: "Choose the Insurance report, then Generate.",
    },
    {
      key: "notifications",
      title: "Turn on notifications",
      body:
        "Enable reminders for borrowed-tool returns, warranty expiries and dealer " +
        "payment dates so nothing slips through the cracks.",
      icon: "notifications",
      route: "/(tabs)/more",
      hint: "Open the “Notifications” section and switch reminders on.",
    },
    {
      key: "theme",
      title: "Make it yours — change the theme",
      body:
        "Open Settings → Theme and pick a look: Iron Forge, Crimson, Arctic, " +
        "Emerald, or a clean light / dark. You’re all set — happy tracking!",
      icon: "color-palette",
      route: "/(tabs)/more",
      hint: "Settings → Theme → choose a look.",
    },
  ];
}
