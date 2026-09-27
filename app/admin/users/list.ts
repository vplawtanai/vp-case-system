import { isAssignablePerson, PEOPLE_ROLES, type PeopleProfile } from "../../../lib/people";

export type UserListFilter = "all" | "unclassified" | "operational" | "uat" | "assignable" | "inactive";
export type UserListSort = "recommended" | "name" | "role" | "status";

export const USER_LIST_FILTERS: ReadonlyArray<{ value: UserListFilter; label: string }> = [
  { value: "all", label: "ทั้งหมด" },
  { value: "unclassified", label: "ยังไม่จัดประเภท" },
  { value: "operational", label: "ใช้งานจริง" },
  { value: "uat", label: "UAT / ทดสอบ" },
  { value: "assignable", label: "รับมอบหมายงานได้" },
  { value: "inactive", label: "ปิดใช้งาน" },
];
export const USER_LIST_SORTS: ReadonlyArray<{ value: UserListSort; label: string }> = [
  { value: "recommended", label: "แนะนำ" },
  { value: "name", label: "ชื่อ" },
  { value: "role", label: "บทบาท" },
  { value: "status", label: "สถานะ" },
];

const groups = ["unclassified", "operational", "uat", "inactive"];
const collator = new Intl.Collator("th", { sensitivity: "base", numeric: true });
const displayName = (user: PeopleProfile) => user.staff_name?.trim() || user.full_name?.trim() || user.email || "";
const group = (user: PeopleProfile) => !user.active ? "inactive" : user.account_type || "unclassified";
const rolePriority = (user: PeopleProfile) => {
  const index = PEOPLE_ROLES.findIndex(role => role === user.role);
  return index < 0 ? PEOPLE_ROLES.length : index;
};

// Presentation only: never mutate the API's profiles or infer classification from identity text.
export function organizeUsers(users: readonly PeopleProfile[], query: string, filter: UserListFilter, sort: UserListSort): PeopleProfile[] {
  const search = query.trim().toLocaleLowerCase("th");
  const byName = (a: PeopleProfile, b: PeopleProfile) => collator.compare(displayName(a), displayName(b))
    || collator.compare(a.email || "", b.email || "") || a.id.localeCompare(b.id);
  const byGroup = (a: PeopleProfile, b: PeopleProfile) => groups.indexOf(group(a)) - groups.indexOf(group(b));
  const byRole = (a: PeopleProfile, b: PeopleProfile) => rolePriority(a) - rolePriority(b);
  return users.filter(user =>
    (filter === "all" || (filter === "assignable" ? isAssignablePerson(user) : group(user) === filter))
    && (!search || [user.full_name, user.staff_name, user.email].some(value => value?.toLocaleLowerCase("th").includes(search))),
  ).sort((a, b) => {
    if (sort === "name") return byName(a, b);
    if (sort === "role") return byRole(a, b) || byGroup(a, b) || byName(a, b);
    if (sort === "status") return Number(b.active) - Number(a.active) || byName(a, b);
    return byGroup(a, b) || byRole(a, b) || byName(a, b);
  });
}
