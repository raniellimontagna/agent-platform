# ADR-0001 — Stack: TypeScript, Hono, Drizzle

**Status:** Accepted  
**Date:** 2026-06-10

## Contexto

Precisamos de uma stack backend coerente para o orquestrador de agentes: HTTP server leve, ORM tipado e runtime previsível.

## Decisão

| Camada | Escolha | Alternativa descartada |
|---|---|---|
| Linguagem | TypeScript/Node LTS | Python (ecossistema LangGraph JS/TS priorizado) |
| Package manager | pnpm | npm, yarn |
| HTTP framework | Hono | Express, Fastify |
| Banco principal | Postgres | MySQL, SQLite |
| ORM/query builder | Drizzle | Prisma, Kysely |
| Cache/fila | Redis + BullMQ | RabbitMQ, SQS |
| Orquestração | LangGraph JS/TS | LangChain Python |

Kysely pode ser usado pontualmente para queries muito específicas onde o Drizzle não oferece expressividade suficiente.

## Consequências

- Tipagem end-to-end sem geração de código pesada (Drizzle é schema-first em TS).
- Hono é edge-ready e tem overhead mínimo para a API do orquestrador.
- BullMQ + Redis cobre filas de jobs e cache sem adicionar dependências extras.
- LangGraph JS/TS mantém paridade de features com a versão Python para os casos de uso do MVP.
