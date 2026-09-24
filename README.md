# Ward 44 

This version keeps the previous Ward 44 public UI and adds Google Drive media storage.

## Architecture
- Public portal: `index.html`
- Separate Parishad dashboard: `dashboard.html`
- Frontend: GitHub + Vercel
- Data: Google Sheets through Google Apps Script
- Photos/videos: Google Drive through the same Apps Script
- No Supabase

## Google Drive setup
1. Open the Google Sheet **Ward 44 Complaints**.
2. Open **Extensions → Apps Script**.
3. Replace the existing `Code.gs` with the `Code.gs` in this ZIP.
4. Save.
5. Deploy → **Manage deployments** → edit the existing Web App → create a **new version**.
6. Keep **Execute as: Me**.
7. Keep **Who has access: Anyone**.
8. Authorize Google Drive access when Google asks. This is your Google account; do not share your password.
9. Keep the same `/exec` URL. The website is already configured with the user's existing Apps Script URL.

## Drive organization
The script automatically creates:
`Ward 44 Complaints Media / W44-YYYY-0001 / Photos` and `Videos`.

The Google Sheet automatically adds:
- Photo Links
- Video Links
- Drive Folder
- Media Key (authorization value used internally for that complaint)

Existing 14-column sheets are upgraded automatically when the Apps Script runs.

## Media behavior
- Photos are resized/compressed in the browser before upload.
- Up to 4 photos can be selected.
- Video uploads are limited to 8 MB by the website to reduce phone memory and Apps Script payload problems.
- Each media file is uploaded separately, instead of sending all files in one large request.
- Drive links are saved in the complaint row.
- Dashboard shows links to the saved photos/videos and the complaint Drive folder.
- Files are set to **Anyone with the link → Viewer** so the Parishad dashboard can open them without Google login. This means the link itself should be treated as shareable; the Drive folder is not publicly searchable/listed.

## Important
Google Drive free storage is limited by the storage available on the Google account. Videos consume that storage faster than photos.

For very large videos or high-volume production use, a later version should use a more scalable direct upload architecture rather than sending large base64 payloads through Apps Script.
