import {createHash} from 'node:crypto';
import {sourceInventory} from './export-source.mjs';
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function verificationInputs(root,environment){return {sourceSha256:digest(JSON.stringify(sourceInventory(root))),environmentSha256:digest(JSON.stringify(environment))};}
export function verificationComplete(report){
 const expected=['node','syntax','catalog','automation','credentials','entry','replay','registration'];
 return report?.schemaVersion===1&&report.scope==='pc_source_synthetic'&&!report.error&&report.before?.sourceSha256===report.after?.sourceSha256&&report.before?.environmentSha256===report.after?.environmentSha256&&/^[a-f0-9]{64}$/.test(report.before?.sourceSha256??'')&&/^[a-f0-9]{64}$/.test(report.before?.environmentSha256??'')&&expected.every(name=>report.stages?.filter(s=>s.name===name).length===1&&report.stages.find(s=>s.name===name)?.status==='passed'&&Number.isSafeInteger(report.stages.find(s=>s.name===name)?.checks)&&report.stages.find(s=>s.name===name).checks>0)&&report.stages.length===expected.length;
}
