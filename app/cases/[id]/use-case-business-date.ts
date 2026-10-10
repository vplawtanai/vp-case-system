"use client";
import {useEffect,useState} from 'react';
import {caseBusinessDate} from './service-model';

// Keep an open read model current across Bangkok midnight and background-tab resumes.
export function useCaseBusinessDate(){
 const [today,setToday]=useState(()=>caseBusinessDate());
 useEffect(()=>{
  const refresh=()=>setToday(caseBusinessDate());
  const timer=window.setInterval(refresh,30000);
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',refresh);
  return()=>{window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[]);
 return today;
}
