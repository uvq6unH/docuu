export const movementRules = {
  tickHz: 30, maxCatchUpTicks: 5, maxSubstep: 0.15,
  radius: 0.35, standingHeight: 1.7, crouchHeight: 1.1,
  eyeHeight: 1.55, crouchEyeHeight: 0.95,
  gravity: 18, jumpSpeed: 5.8, crouchSpeed: 2.5,
  maxStamina: 100, resumeStamina: 20, regenPerSecond: 16, regenDelaySeconds: 1.2,
  roles: {
    POLICE: { walk: 5.2, sprint: 7, drainPerSecond: 20 },
    ROBBER: { walk: 4.8, sprint: 7.5, drainPerSecond: 16 },
  },
} as const;
