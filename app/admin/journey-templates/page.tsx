import {cookies} from 'next/headers';
import {notFound,redirect} from 'next/navigation';
import {JOURNEY_COOKIE} from '../../../lib/advisory-flexible-journey';
import {journeyPageAllowed,JourneyAdminError} from '../../../lib/server/advisory-journey';
import JourneyTemplates from './JourneyTemplates';
export const dynamic='force-dynamic';
export default async function JourneyTemplatesPage(){
 const token=(await cookies()).get(JOURNEY_COOKIE)?.value;if(!token)redirect('/admin/journey-templates/access');
 try{await journeyPageAllowed(token);}catch(e){if(e instanceof JourneyAdminError&&e.status===401)redirect('/admin/journey-templates/access');notFound();}
 return <JourneyTemplates/>;
}
