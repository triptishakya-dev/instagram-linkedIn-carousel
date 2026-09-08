import { Client, Connection } from "@temporalio/client";

export const CONTENT_TASK_QUEUE =
  process.env.TEMPORAL_TASK_QUEUE ?? "content-generation";

export function temporalAddress(): string {
  return process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
}

export function temporalNamespace(): string {
  return process.env.TEMPORAL_NAMESPACE ?? "default";
}

/** A client for starting workflows, used by API routes. */
export async function temporalClient(): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const connection = await Connection.connect({
    address: temporalAddress(),
    connectTimeout: "10s",
  });
  return {
    client: new Client({ connection, namespace: temporalNamespace() }),
    close: () => connection.close(),
  };
}
