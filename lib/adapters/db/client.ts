// Database port (domain-rules §12). One MongoClient per process (Atlas free tier: 500 connections),
// created lazily from MONGODB_URI. Before any database-backed work the deployment's topology is
// checked with `hello`: a standalone mongod cannot run multi-document transactions, so it is refused.
// Never logs or returns the connection string.
import { MongoClient, type Db } from "mongodb";

export type DatabaseState = "not_configured" | "connected" | "not_replica_set" | "unreachable";

export class DatabaseNotReadyError extends Error {
  readonly state: Exclude<DatabaseState, "connected">;
  constructor(state: Exclude<DatabaseState, "connected">) {
    super(`database ${state.replaceAll("_", " ")}`);
    this.name = "DatabaseNotReadyError";
    this.state = state;
  }
}

export interface DatabaseConfig {
  uri: string;
  dbName: string;
}

export const DEFAULT_DB_NAME = "horekbazar";

/** Reads MONGODB_URI / MONGODB_DB; null when the database is not configured. */
export function databaseConfig(env: Record<string, string | undefined>): DatabaseConfig | null {
  const uri = env.MONGODB_URI?.trim();
  if (!uri || !/^mongodb(\+srv)?:\/\/.+/.test(uri)) return null;
  const dbName = env.MONGODB_DB?.trim() || DEFAULT_DB_NAME;
  return { uri, dbName };
}

interface Cached {
  key: string;
  client: MongoClient;
  /** Last topology check, so a page render does not pay an extra round trip every time. */
  checked?: { state: DatabaseState; at: number };
}

/** How long a topology result is reused: healthy results longer than failures, so recovery shows quickly. */
const CHECK_TTL_MS = { connected: 30_000, other: 5_000 } as const;

// Survives Next.js dev hot reloads, which re-evaluate modules but keep globalThis.
const holder = globalThis as unknown as { __hbMongo?: Cached };

export function getClient(config: DatabaseConfig): MongoClient {
  const key = `${config.uri}\u0000${config.dbName}`;
  if (holder.__hbMongo?.key === key) return holder.__hbMongo.client;
  const client = new MongoClient(config.uri, {
    appName: "horekbazar",
    // Undefined optional fields are omitted rather than stored as null (validators are strict).
    ignoreUndefined: true,
    retryWrites: true,
    serverSelectionTimeoutMS: 5_000,
    connectTimeoutMS: 5_000,
    maxPoolSize: 10,
  });
  holder.__hbMongo = { key, client };
  return client;
}

/** `hello` says a replica set member (`setName`) or a mongos router (`msg: "isdbgrid"`). */
export function isTransactionCapable(hello: { setName?: unknown; msg?: unknown }): boolean {
  return typeof hello.setName === "string" || hello.msg === "isdbgrid";
}

/** Connects and checks the topology. Error details stay server-side; callers get a state. */
export async function checkDatabase(config: DatabaseConfig | null, options: { fresh?: boolean } = {}): Promise<DatabaseState> {
  if (!config) return "not_configured";
  const client = getClient(config);
  const cached = holder.__hbMongo?.checked;
  if (!options.fresh && cached) {
    const ttl = cached.state === "connected" ? CHECK_TTL_MS.connected : CHECK_TTL_MS.other;
    if (Date.now() - cached.at < ttl) return cached.state;
  }
  let state: DatabaseState;
  try {
    const hello = await client.db("admin").command({ hello: 1 });
    state = isTransactionCapable(hello) ? "connected" : "not_replica_set";
  } catch {
    state = "unreachable";
  }
  if (holder.__hbMongo?.client === client) holder.__hbMongo.checked = { state, at: Date.now() };
  return state;
}

/** The database for database-backed work; throws DatabaseNotReadyError unless it is a connected replica set. */
export async function getDatabase(env: Record<string, string | undefined> = process.env): Promise<Db> {
  const config = databaseConfig(env);
  const state = await checkDatabase(config);
  if (state !== "connected" || !config) throw new DatabaseNotReadyError(state === "connected" ? "not_configured" : state);
  return getClient(config).db(config.dbName);
}

/** For scripts and tests: closes the per-process client. */
export async function closeDatabase(): Promise<void> {
  const cached = holder.__hbMongo;
  delete holder.__hbMongo;
  if (cached) await cached.client.close();
}
