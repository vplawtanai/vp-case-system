import {handleVisualRequest} from '../../../../lib/server/visual-assets';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export const GET=(request:Request)=>handleVisualRequest(request);
export const POST=(request:Request)=>handleVisualRequest(request);
export const DELETE=(request:Request)=>handleVisualRequest(request);
