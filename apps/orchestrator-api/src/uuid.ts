/**
 * Valida o formato UUID (v1-v5). As rotas `:id` batem em colunas uuid do Postgres
 * — um id não-uuid faria o cast lançar (→ 500). Guardar o formato antes evita isso
 * (MAC-64). Exportado p/ teste.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
