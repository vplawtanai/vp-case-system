import {handleJourneyArtwork} from '../../../../lib/server/advisory-artwork';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>handleJourneyArtwork(request);
