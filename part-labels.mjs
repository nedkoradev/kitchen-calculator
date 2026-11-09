// Physical identities follow the full model order, independent of visibility,
// cut-list exclusion and aggregation of identical manufactured panels.
export function partLabelIndex(parts){
 const groups=new Map(),labels=new Map();
 for(const part of parts){
  const key=part.assembly||part.key;
  if(!groups.has(key))groups.set(key,{number:groups.size+1,count:0});
  const group=groups.get(key);labels.set(part.key,'Д'+group.number+'-'+(++group.count));
 }
 return labels;
}
