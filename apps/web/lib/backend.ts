import { BedroomApiClient, RemoteLayoutRepository } from "@bedroom/bedroom-core";

export const publicApiBaseUrl = (process.env.PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "");

export function createRemoteLayoutRepository(getAccessToken?: () => Promise<string | null>) {
  if (!publicApiBaseUrl) throw new Error("PUBLIC_API_BASE_URL is not configured for this client build.");
  return new RemoteLayoutRepository(new BedroomApiClient({ baseUrl: publicApiBaseUrl, getAccessToken }));
}
