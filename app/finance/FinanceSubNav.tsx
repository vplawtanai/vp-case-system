import type { UserPermissions } from "../../lib/permissions";
import type { FinanceSubNavPage } from "./finance-navigation";
// Existing pages keep their API; the application sidebar owns Finance navigation.
export default function FinanceSubNav(_props: { activePage: FinanceSubNavPage; permissions: UserPermissions }) { // eslint-disable-line @typescript-eslint/no-unused-vars
 return null;
}
