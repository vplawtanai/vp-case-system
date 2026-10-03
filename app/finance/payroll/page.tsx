import {cookies} from 'next/headers';
import {notFound,redirect} from 'next/navigation';
import {PAYROLL_COOKIE} from './model';
import {payrollPageAllowed,PayrollError} from '../../../lib/server/finance-payroll';
import PayrollWorkspace from './workspace';
export const dynamic='force-dynamic';
export default async function PayrollPage(){
 const token=(await cookies()).get(PAYROLL_COOKIE)?.value;if(!token)redirect('/finance/payroll/access');
 try{await payrollPageAllowed(token);}catch(e){if(e instanceof PayrollError&&e.status===401)redirect('/finance/payroll/access');notFound();}
 return <PayrollWorkspace/>;
}
