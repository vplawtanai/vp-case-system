import {supabase} from '../../../lib/supabase';
export async function journeyRequest(body?:unknown){
 const {data,error}=await supabase.auth.getSession();if(error||!data.session)throw Error('ADVISORY_UNAUTHORIZED');
 const response=await fetch('/api/admin/journey-templates',{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:'Bearer '+data.session.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const result=await response.json();if(!response.ok)throw Error(result.error||'ADVISORY_INVALID_INPUT');return result;
}
