import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {convertRows} from '../shared/timetable.mjs';
test('real XLSX binary round trip preserves dates, cached formula times and recurrence',async()=>{
  const wb=new ExcelJS.Workbook();const ws=wb.addWorksheet('体育课表');
  ws.addRow(['日期','场地','开始时间','结束时间','课程名称','周次','星期']);
  ws.addRow([new Date('2026-11-02T00:00:00Z'),'操场',{formula:'TIME(11,17,0)',result:677/1440},{formula:'TIME(13,43,0)',result:823/1440},'跨午体育课','','']);
  ws.addRow(['','体育馆',847/1440,943/1440,'双周体育课','2-4(双)','1']);
  const loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await wb.xlsx.writeBuffer());
  const table=[];loaded.worksheets[0].eachRow({includeEmpty:true},r=>table.push(r.values.slice(1)));
  const result=convertRows(table,'2026-10-26');assert.deepEqual(result.errors,[]);
  assert.deepEqual(result.rows.map(r=>[r.date,r.start,r.end]),[['2026-11-02','11:17','13:43'],['2026-11-02','14:07','15:43'],['2026-11-16','14:07','15:43']]);
});
