'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {journeyRequest} from '../client';
import {useI18n} from '../../../../lib/i18n/provider';
import {journeyText} from '../labels';
export default function JourneyAccess(){
 const [denied,setDenied]=useState(false),{locale}=useI18n();
 useEffect(()=>{let live=true;void journeyRequest({action:'session'}).then(()=>{if(live)window.location.replace('/admin/journey-templates');}).catch(()=>{if(live)setDenied(true);});return()=>{live=false;};},[]);
 return <main style={{padding:32}}><h1>{journeyText(locale,'title')}</h1><p role={denied?'alert':'status'}>{journeyText(locale,denied?'denied':'loading')}</p><Link href="/dashboard">{journeyText(locale,'back')}</Link></main>;
}
