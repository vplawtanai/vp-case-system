import {handleJourneyRequest} from '../../../../lib/server/advisory-journey';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handleJourneyRequest(request);}
export async function POST(request:Request){return handleJourneyRequest(request);}
