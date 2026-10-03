'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {payrollRequest} from '../client';
import {useI18n} from '../../../../lib/i18n/provider';
import {payrollText} from '../labels';
export default function PayrollAccess(){
 const [denied,setDenied]=useState(false),{locale}=useI18n();
 useEffect(()=>{let live=true;void payrollRequest({action:'session'}).then(()=>{if(live)window.location.replace('/finance/payroll');}).catch(()=>{if(live)setDenied(true);});return()=>{live=false;};},[]);
 return <main style={{padding:24}}><h1>{payrollText(locale,'title')}</h1><p role={denied?'alert':'status'}>{payrollText(locale,denied?'denied':'loading')}</p><Link href="/dashboard">{payrollText(locale,'back')}</Link></main>;
}
