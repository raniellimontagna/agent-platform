export function labelJustAdded(input: {
  currentNames?: string[];
  currentIds?: string[];
  previousNames?: string[];
  previousIds?: string[];
  action: string;
  name: string;
  id?: string;
}): boolean {
  const currentNames = input.currentNames ?? [];
  const currentIds = input.currentIds ?? [];
  const hasNow =
    currentNames.includes(input.name) || (!!input.id && currentIds.includes(input.id));
  if (!hasNow) return false;
  if (input.action !== 'update') return true;
  if (input.previousNames === undefined && input.previousIds === undefined) {
    return false;
  }

  const previousNames = input.previousNames ?? [];
  const previousIds = input.previousIds ?? [];
  const hadBefore =
    previousNames.includes(input.name) || (!!input.id && previousIds.includes(input.id));
  return !hadBefore;
}
