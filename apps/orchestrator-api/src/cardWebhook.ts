export function labelJustAdded(input: {
  currentNames: string[];
  currentIds: string[];
  previousNames: string[];
  previousIds: string[];
  action: string;
  name: string;
  id?: string;
}): boolean {
  const hasNow =
    input.currentNames.includes(input.name) || (!!input.id && input.currentIds.includes(input.id));
  if (!hasNow) return false;
  if (input.action !== 'update') return true;
  const hadBefore =
    input.previousNames.includes(input.name) ||
    (!!input.id && input.previousIds.includes(input.id));
  return !hadBefore;
}
