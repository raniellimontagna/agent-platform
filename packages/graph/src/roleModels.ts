import type { SoftwareRole } from './roleContracts.js';

export const DEFAULT_ROLE_MODEL_ALIASES: Record<SoftwareRole, string | null> = {
  planner: 'research',
  coder: 'strong_coder',
  critic: 'critic',
  pr: null,
  reporter: null,
};

export function modelAliasForRole(
  role: SoftwareRole,
  overrides: Partial<Record<SoftwareRole, string | null>> = {},
): string | null {
  return Object.hasOwn(overrides, role)
    ? (overrides[role] ?? null)
    : DEFAULT_ROLE_MODEL_ALIASES[role];
}
