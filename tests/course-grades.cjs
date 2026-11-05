const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={window:{ShizhiGradeRows:[
 {term:'学期甲',code:'COURSE-A',name:'示例课程甲',score:'SCORE-A',gpa:'GPA-A'},
 {term:'学期乙',code:'COURSE-B',name:'示例课程乙',score:'SCORE-B',gpa:'GPA-B'}
]}};
vm.runInNewContext(fs.readFileSync('public/course-grades.js','utf8'),context);
const grade=context.window.ShizhiGradeForCourse;
assert.equal(grade({name:'示例课程甲',courseCode:'COURSE-A'},'学期甲').score,'SCORE-A');
assert.equal(grade({name:'示例课程乙'},'学期乙').gpa,'GPA-B');
assert.equal(grade({name:'未登记课程'},'学期甲'),null);
console.log('PASS: optional course grades match by course code or title.');
