// Optional grade rows can be supplied before this script loads.
window.ShizhiGradeForCourse=(()=>{
 const rows=Array.isArray(window.ShizhiGradeRows)?window.ShizhiGradeRows:[];
 const nameKey=value=>String(value||'').normalize('NFKC').replace(/[\s（）()《》·・，,、]/g,'').toLowerCase();
 const familyKey=value=>nameKey(value).replace(/^(数学分析|大学英语|体育)(?:ii|i)/,'$1');
 return (course,semester)=>{
  const code=String(course.courseCode||'').trim();
  const byCode=code&&rows.find(row=>String(row.code||'').trim()===code);
  if(byCode)return byCode;
  const matches=rows.filter(row=>nameKey(row.name)===nameKey(course.name));
  const compatible=matches.length?matches:rows.filter(row=>familyKey(row.name)===familyKey(course.name));
  return compatible.find(row=>row.term===semester)||((!semester||semester==='未分学期')&&compatible.length===1?compatible[0]:null);
 };
})();
