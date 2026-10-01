import {cookies} from 'next/headers';
import {notFound,redirect} from 'next/navigation';
import {VISUAL_COOKIE} from '../../../lib/visual-assets';
import {visualPageAllowed,VisualError} from '../../../lib/server/visual-assets';
import VisualAssetLibrary from './VisualAssetLibrary';
export const dynamic='force-dynamic';
export default async function VisualAssetsPage(){
 const token=(await cookies()).get(VISUAL_COOKIE)?.value;
 // The rest of VP OS uses browser-held sessions. This scoped bridge exchanges
 // one only after server verification; no global auth/cookie behavior changes.
 if(!token)redirect('/admin/visual-assets/access');
 try{await visualPageAllowed(token);}catch(e){if(e instanceof VisualError&&e.status===401)redirect('/admin/visual-assets/access');notFound();}
 return <VisualAssetLibrary/>;
}
