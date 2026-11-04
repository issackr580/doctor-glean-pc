import {randomUUID} from 'node:crypto';
export class ReportPreview{
 constructor({now=Date.now}={}){this.now=now;this.current=null;}
 freeze(text){if(typeof text!=='string'||Buffer.byteLength(text)>4194304)throw Error('invalid_report');this.current={token:randomUUID(),text,at:this.now()};return {token:this.current.token,text};}
 text(token){return typeof token==='string'&&token===this.current?.token&&this.now()>=this.current.at&&this.now()-this.current.at<=600000?this.current.text:null;}
}
