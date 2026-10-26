const DEFINITIONS={
 developer:Object.freeze({id:'developer',developer:true,name:'의사 이삭 줍기 PC 개발자용',appId:'kr.webinar.planner.pc.developer',directory:'DoctorGleanPC-Developer',executable:'DoctorGlean-Developer.exe'}),
 distribution:Object.freeze({id:'distribution',developer:false,name:'의사 이삭 줍기 PC',appId:'kr.webinar.planner.pc.app',directory:'DoctorGleanPC',executable:'DoctorGlean.exe'}),
};
export function resolveEdition(id){
 if(!Object.hasOwn(DEFINITIONS,id))throw Error('invalid_edition');
 return DEFINITIONS[id];
}
