# Azure Blob Storage for prescription files

MedSync keeps uploaded files (PDF, PNG, JPEG, up to 5 MB) in Azure Blob Storage. Without these settings it uses a local folder (`backend/uploads`), which is fine for development.

## Set it up

1. Azure portal: **Create a resource → Storage account**.
   - Subscription: your Azure for Students subscription. Resource group: `medsync-rg`. Name: lowercase letters and digits only, for example `medsyncfiles123` (must be unique).
   - Region: same as the database (East Asia). Performance: **Standard**. Redundancy: **Locally-redundant storage (LRS)**, the cheapest.
2. Open the account, then **Settings → Configuration**, and set **Allow Blob anonymous access** to **Disabled**. Save.
3. Open **Security + networking → Access keys**, click **Show** next to key1, and copy the **Connection string**.
4. In `backend/.env` add (no quotes):
   ```env
   AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...;EndpointSuffix=core.windows.net
   AZURE_STORAGE_CONTAINER=prescription-files
   ```
   The connection string is a password. Never commit it or paste it in a screenshot.
5. Restart the backend. The first upload creates the private container `prescription-files`.
6. Check: sign in as a doctor, open **My prescriptions → Details → Add a file**. In the portal, **Containers → prescription-files** shows a folder `rx-<number>` with the file. The admin Analytics tab says "Files are kept in Azure Blob Storage".

## Notes

- Files are only reachable through the API, which checks who may see the prescription. There are no public links.
- Cost: a few MB in LRS costs well under a rupee a month. Deleting `medsync-rg` removes everything.
- Tests: `AZURE_TEST_CONNECTION_STRING=<a test account> npm test` runs the file test against Azure instead of the local folder. It was run against the Azurite emulator, not against a real storage account.
