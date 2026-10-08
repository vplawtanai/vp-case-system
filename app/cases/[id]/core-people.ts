import type { SupabaseClient } from '@supabase/supabase-js';
import { isAssignablePerson, type PeopleProfile } from '../../../lib/people';
import type { CoreData } from './core-model';

type AssignmentProfile = Pick<PeopleProfile, 'id'|'staff_name'|'full_name'|'active'|'account_type'|'assignable'|'must_change_password'|'role'>;
export function assignmentPeople(data:CoreData, profiles:AssignmentProfile[]):CoreData {
 const byId=new Map(profiles.map(p=>[p.id,p]));
 return {...data,people:data.people.map(person=>{
  const profile=byId.get(person.id);
  return {...person,
   name:profile?.staff_name?.trim() || profile?.full_name?.trim() || (person.name===person.id?'':person.name),
   full_name:profile?.full_name ?? person.full_name,
   eligible:!!profile && isAssignablePerson(profile) && profile.must_change_password===false
    && ['admin','partner','lawyer','assistant_lawyer','staff'].includes(profile.role),
  };
 })};
}

// Use the existing authenticated People read policy; no privileged client or new identity source.
export async function loadAssignmentPeople(data:CoreData, client:SupabaseClient):Promise<CoreData> {
 if(!data.people.length)return data;
 const result=await client.from('user_profiles')
  .select('id,staff_name,full_name,active,account_type,assignable,must_change_password,role')
  .in('id',data.people.map(p=>p.id));
 if(result.error)throw result.error;
 return assignmentPeople(data,result.data || []);
}
