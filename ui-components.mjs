// Shared data-table component used by the project and the visual UI catalogue.
export const cutTableHeaders=Object.freeze(['Етикет','Забележка','Брой','Краен размер','Дебелина','Кантирани ръбове','Кант']);
export function createDataTable(headers,rows){
 const t=document.createElement('table'),head=t.createTHead(),hr=head.insertRow();
 headers.forEach(v=>{const th=document.createElement('th');th.textContent=v;hr.append(th)});
 const body=t.createTBody();
 rows.forEach(values=>{const tr=body.insertRow();values.forEach((v,i)=>{const td=tr.insertCell();td.textContent=String(v);if(i===0)td.style.fontWeight='600'})});
 return t;
}
