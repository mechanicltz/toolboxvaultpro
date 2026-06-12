# BUILD 274 batch (2026-06-12)

1. ADD buttons (edit form) → `compact` PillButton (shorter pills). New `compact` prop on `src/components/PillButton.tsx`.
2. Item-detail attachment buttons renamed to "ADD": `tool/[id].tsx` (photo), `DocumentsSection.tsx`, `ReceiptsSection.tsx`.
6. Dealer ACCOUNTS panels off-screen → `BalanceSection.tsx`: moved `balCardSkinFrame` marginHorizontal off the `width:100%` TbvFrame onto a wrapper `<View>` (same TbvFrame width-bug fix pattern).
2b. Action grid (`tool/[id].tsx`): gap 8→5, tile width 48.5%→49.3%, paddingH 6→4, skinned label 12→11px — gives buttons more length so text isn't clipped.
4. Report back-nav: `reports.tsx` — when the dealer "See report" deep-links into the `format` step, both back handlers now `router.back()` (return to dealer) instead of `setStep()` to a skipped wizard step. Tracked via `presetEntryStep` ref.
5. Dealer/agent "text" button: `openSms()` in `src/contactLinks.ts` ALREADY opens a blank `sms:` (no body/template). The broken-tool draft the user saw is iOS Messages restoring a previously-typed draft for that contact (OS behavior), NOT our code. No change made — confirm with user.

## PENDING in this batch
3. App-wide keyboard audit: 16/24 TextInput files already wrap KeyboardAvoidingView. Remaining genuine forms to wrap: `app/forgot-password.tsx`, `app/manage/[kind].tsx`, `app/for-sale.tsx`. (Search-only `inventory`/`_layout` and dead `warranty-claims` don't need it; `reports` fields are in a ScrollView; `admin/backups` is admin-only.) NEEDS a focused follow-up pass + on-device test.
