# NETVYL Admin User Guide

This guide is for **Company Administrators** and **NETVYL Master Admins**. Use the role that matches your work: a Company Administrator manages one business workspace; a Master Admin manages the NETVYL platform and customer workspaces.

## Sign in and choose a workspace

1. Open the NETVYL sign-in page and choose **Administrator**.
2. Sign in with the administrator email and password created during activation or staff invitation. Staff IDs are for Staff Login, not Administrator Login.
3. If your account belongs to more than one company, choose the correct workspace from the selector in the left sidebar before changing data.
4. Use **Log out** when finished, especially on a shared device.

The sidebar only shows pages allowed for your role. Company data is scoped to the selected workspace.

Company Administrators and Master Admins can use **Contact Support** at the bottom of the sidebar to email `netvylresources@gmail.com`.

## Company Administrator

### Set up the business before taking orders

Open **Administration → Business Setup** and work through the tabs:

1. **Services:** Add each service and choose its calculator type (for example Large Format, DTF, or Direct Image).
2. **Prices:** Configure the prices used to calculate customer orders.
3. **Inventory:** Add materials or products with a unit, cost, selling price, opening stock and reorder level. Direct Image size and finishing prices can also be configured here.
4. **Workflows:** Define the production steps for each service. These steps appear on the Production Board.
5. **Options and Recipes:** Configure service variants and material consumption recipes where applicable.

Save each change. Create a test order and check its calculated price and workflow before relying on new configuration for live work.

### Manage staff and company settings

Open **Administration** to manage the company profile, staff access and workspace controls. In **Staff & Roles**, add a staff member, assign the role that fits their duties, then share their generated Staff ID and sign-in instructions privately. You can update staff access or remove a staff member whose access should end.

Roles are intentionally different:

- **Administrator:** Full company configuration, staff and protected controls.
- **Manager:** Operational oversight with fewer configuration and destructive permissions.
- **Staff, Cashier and Production:** Day-to-day work limited to the pages and actions needed for their role.
- **Master Admin:** Platform administration; this is not a normal company staff role.

### Protect and maintain inventory

Inventory edits and other protected actions may require an unlock from **Administration**. Unlock only when you need to make a protected change, complete it, then lock it again. Record stock received through **Purchasing** where possible so the inventory ledger reflects the transaction. Avoid deleting inventory items that have already been used in orders.

### Daily order workflow

1. Open **New Job**, select or add the customer, choose the service, enter the job details and attach artwork if needed.
2. Review the calculated amount, due date and any notes, then save the job.
3. Track work through **Production Board** and update steps as work progresses. **Print Station** supports the print queue.
4. Record full or partial payments in **Payments**. Review balances and issue receipts as needed.
5. Use **Delivery** to record dispatch or collection and update delivery status.
6. Use **Job Records**, **Customers**, **Quotes**, **Purchasing**, **Expenses** and **Reports** to review related business activity.

Check the customer, service, quantity and amount before saving. Correct records through the relevant page and keep payment and stock entries tied to their real transactions.

### Backup and export

Open **Administration → Backup & Export** and download a workspace backup regularly. Store the downloaded file somewhere access-controlled and separate from the device running NETVYL. A downloaded backup is a copy; it does not automatically restore data. Treat exports as confidential because they can contain customer and business records.

### License and access issues

An expired license keeps company records readable but blocks operational changes. Use **Renew** to submit payment details and wait for verification. Contact your Master Admin if your company is suspended or if you cannot access the workspace. Ask an administrator to reset a forgotten password using the sign-in page's password recovery option.

## NETVYL Master Admin

Open **Master Admin** with a platform administrator account. The page provides these areas:

- **Overview:** Review organizations, pending registrations and payments, license status, devices and global settings.
- **Organizations:** Create or inspect workspaces, activate or suspend them, issue licenses, and enter Support Mode when customer assistance requires it.
- **Licensing:** Review payment submissions and evidence. Approve only verified payments; approval activates the related license and organization. Manage license status, plans and email delivery.
- **Global settings:** Maintain shared branding, feature controls, release notices and payment instructions.
- **Operations:** Review registered devices and the platform audit trail.

Support Mode opens a specific organization so you can investigate a customer issue. Confirm the workspace name in the sidebar and support banner before acting; actions are scoped to that workspace and recorded. Use **Exit Support Mode** to return to platform administration.

Use organization suspension, license revocation/deletion, plan changes and force-update controls carefully because they can affect customer access. Verify the organization and intended change before saving.

## Quick troubleshooting

- **A page is missing:** Your role may not have permission. Ask a Company Administrator to review your access.
- **A change is rejected:** Check that the correct workspace is selected and its license is active; review the message shown on the page.
- **Inventory editing is locked:** Unlock the protected inventory action from Administration, make the change, then lock it again.
- **A price or workflow is missing from New Job/Production:** Check that the related service and configuration are active in Business Setup.
- **A payment or license is still pending:** Master Admin verification is required; submitting payment does not activate a license by itself.

## Administrator checklist

- Confirm the selected workspace before making changes.
- Give each person only the role they need.
- Keep services, prices, stock and workflows current.
- Reconcile recorded payments and purchasing with actual transactions.
- Download and securely store backups on a regular schedule.
- Sign out on shared devices and lock protected controls after use.
