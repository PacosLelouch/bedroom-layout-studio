import type { FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { ApiConfig } from "./config.js";

export interface RequestIdentity {
  userId: string;
  tenantId: string;
  workspaceId: string;
  subject: string;
}

export type ExternalIdentityMapper = (input: { issuer: string; subject: string; tenantId: string; workspaceId: string; displayName?: string }) => Promise<string>;

declare module "fastify" {
  interface FastifyRequest {
    identity: RequestIdentity;
  }
}

export const developmentIdentity: RequestIdentity = {
  userId: "00000000-0000-4000-8000-000000000001",
  tenantId: "00000000-0000-4000-8000-000000000002",
  workspaceId: "00000000-0000-4000-8000-000000000003",
  subject: "development-user",
};

export function createIdentityResolver(config: ApiConfig, mapExternalIdentity?: ExternalIdentityMapper) {
  if (config.auth.mode === "development") {
    return async (request: FastifyRequest) => ({
      userId: header(request, "x-user-id") ?? developmentIdentity.userId,
      tenantId: header(request, "x-tenant-id") ?? developmentIdentity.tenantId,
      workspaceId: header(request, "x-workspace-id") ?? developmentIdentity.workspaceId,
      subject: header(request, "x-user-subject") ?? developmentIdentity.subject,
    });
  }

  const jwks = createRemoteJWKSet(new URL(config.auth.jwksUrl!));
  return async (request: FastifyRequest): Promise<RequestIdentity> => {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) throw Object.assign(new Error("Bearer token is required."), { statusCode: 401, code: "unauthorized" });
    const { payload } = await jwtVerify(authorization.slice(7), jwks, { issuer: config.auth.issuer, audience: config.auth.audience });
    const tenantId = stringClaim(payload, "tenant_id");
    const workspaceId = stringClaim(payload, "workspace_id");
    if (!payload.sub || !tenantId || !workspaceId || !mapExternalIdentity) throw Object.assign(new Error("Token is missing required tenant/workspace claims or identity mapping is unavailable."), { statusCode: 403, code: "forbidden" });
    const userId = await mapExternalIdentity({ issuer: config.auth.issuer!, subject: payload.sub, tenantId, workspaceId, displayName: stringClaim(payload, "name") ?? undefined });
    return { subject: payload.sub, tenantId, workspaceId, userId };
  };
}

function header(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function stringClaim(payload: Record<string, unknown>, key: string) {
  return typeof payload[key] === "string" ? payload[key] as string : null;
}
