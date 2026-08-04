// The server-side source of truth for every perk's real price — mirrors
// the PERKS arrays in BusinessPerksShop.jsx / WorkerTokenShop.jsx (tier
// ids match exactly), but the frontend copy is presentational only. A
// purchase request's cost is ALWAYS resolved here (findPerkTier), never
// trusted from the request body, so a tampered client can't buy a perk for
// less than its real price. durationHours resolves a tier's real expiry
// (perks.controller.js); null means one-time/no time window.
export const PERKS_CATALOG = {
  business: [
    {
      id: "flash-post",
      name: "Flash Post",
      tiers: [
        { id: "24h-express", label: "24-Hour Express", cost: 15, durationHours: 24 },
        { id: "3d-featured", label: "3-Day Featured", cost: 35, durationHours: 72 },
        { id: "7d-dominance", label: "7-Day Dominance", cost: 70, durationHours: 168 },
      ],
    },
    {
      id: "ai-shortlist",
      name: "AI Shortlist",
      tiers: [
        { id: "single-use", label: "Single-Use Pass", cost: 35, durationHours: null },
        { id: "7d-active", label: "7-Day Active", cost: 90, durationHours: 168 },
      ],
    },
    {
      id: "enterprise-broadcast",
      name: "Enterprise Broadcast",
      tiers: [{ id: "one-time", label: "One-Time Broadcast", cost: 120, durationHours: null }],
    },
  ],
  worker: [
    {
      id: "gold-highlight",
      name: "Gold Highlight",
      tiers: [
        { id: "24h-express", label: "24-Hour Express", cost: 15, durationHours: 24 },
        { id: "3d-featured", label: "3-Day Featured", cost: 35, durationHours: 72 },
        { id: "7d-dominance", label: "7-Day Dominance", cost: 70, durationHours: 168 },
      ],
    },
    {
      id: "momentum-shield",
      name: "Momentum Shield",
      tiers: [
        { id: "single-use", label: "Single-Use Pass", cost: 15, durationHours: null },
        { id: "7d-active-shield", label: "7-Day Active Shield", cost: 40, durationHours: 168 },
      ],
    },
    {
      id: "profile-audit",
      name: "Skill Bridge Profile Audit",
      tiers: [{ id: "one-time-review", label: "One-Time Review", cost: 50, durationHours: null }],
    },
  ],
};

export function findPerkTier(role, perkId, tierId) {
  const perk = (PERKS_CATALOG[role] || []).find((p) => p.id === perkId);
  if (!perk) return null;
  const tier = perk.tiers.find((t) => t.id === tierId);
  if (!tier) return null;
  return { perk, tier };
}
