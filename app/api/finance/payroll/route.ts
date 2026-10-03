import {handlePayrollRequest} from '../../../../lib/server/finance-payroll';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handlePayrollRequest(request);}
export async function POST(request:Request){return handlePayrollRequest(request);}
