'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {visualRequest} from '../client';
import {useI18n} from '../../../../lib/i18n/provider';
export default function VisualAccess(){
 const [denied,setDenied]=useState(false),{locale}=useI18n();
 useEffect(()=>{let live=true;void visualRequest({action:'session'}).then(()=>{if(live)window.location.replace('/admin/visual-assets');}).catch(()=>{if(live)setDenied(true);});return()=>{live=false;};},[]);
 return <main style={{padding:32}}><h1>{locale==='en'?'Visual Asset Library':'คลังภาพระบบ'}</h1><p role={denied?'alert':'status'}>{denied?(locale==='en'?'Access denied. An active Admin account is required.':'ไม่อนุญาตให้เข้าถึง ต้องเป็นผู้ดูแลระบบที่เปิดใช้งานเท่านั้น'):(locale==='en'?'Checking access…':'กำลังตรวจสอบสิทธิ์…')}</p><Link href="/dashboard">{locale==='en'?'Back to dashboard':'กลับหน้าแรก'}</Link></main>;
}
