// Known/manual/history support is independent of automatic execution support.
export const automaticEntrySite=site=>['doctorville','medigate','intermd','bluepharm','keymedi','hmp','docple','whodadoc'].includes(site);
export const hmpLedgerSlot=job=>job.site==='hmp'&&job.hmpRepeatSchema===2?32+job.slot:job.slot;
export const legacyHmpConsumed=(ledger,job)=>Object.values(ledger.snapshot().jobs).some(r=>r.site==='hmp'&&r.target===job.key&&r.slot===job.slot&&r.dueAt===job.due);
export const legacyHmpOverlap=(ledger,job)=>job.site==='hmp'&&job.hmpRepeatSchema===2&&job.slot===0&&Object.values(ledger.snapshot().jobs).some(r=>r.site==='hmp'&&r.target===job.key&&r.slot===0&&r.dueAt===job.start);
