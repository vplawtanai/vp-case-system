import { handlePasswordRequest } from "../../../../lib/server/account-password";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => handlePasswordRequest(request);
