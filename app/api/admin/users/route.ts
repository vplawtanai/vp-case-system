import { handlePeopleRequest } from "../../../../lib/server/people-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => handlePeopleRequest(request);
export const POST = (request: Request) => handlePeopleRequest(request);
