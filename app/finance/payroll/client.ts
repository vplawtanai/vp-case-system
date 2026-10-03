import {supabase} from '../../../lib/supabase';
export async function payrollRequest(body?:unknown,period?:string){
 const {data,error}=await supabase.auth.getSession();if(error||!data.session)throw Error('PAYROLL_UNAUTHORIZED');
 const response=await fetch('/api/finance/payroll'+(period?'?period='+encodeURIComponent(period):''),{method:body?'POST':'GET',cache:'no-store',headers:{Authorization:'Bearer '+data.session.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const result=await response.json();if(!response.ok)throw Error(result.error||'PAYROLL_FAILED');return result;
}
