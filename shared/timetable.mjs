import {normalizeBooking,addDays,validDate,weekday} from './domain.mjs';
export function parseCSV(text) {
  const rows=[]; let row=[],cell='',quoted=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++) { const c=text[i]; if(c==='"') {if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;} else if(c===','&&!quoted) {row.push(cell);cell='';} else if((c==='\n'||c==='\r')&&!quoted) {if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c; }
  if(quoted)throw new Error('CSV 引号未闭合'); row.push(cell); if(row.some(x=>x.trim()))rows.push(row); return rows;
}
export const HEADERS=['日期','场地','开始时间','结束时间','课程名称','周次','星期'];
export function parseWeeks(s) {
  s=String(s).replace(/第|周|\s/g,'').replace(/[，、]/g,',').replace(/[~～—–]/g,'-');
  const parity=s.includes('单')?'odd':s.includes('双')?'even':null;s=s.replace(/[单双()（）]/g,'');
  const out=new Set();
  for(const part of s.split(',')) {const m=part.match(/^(\d{1,2})(?:-(\d{1,2}))?$/); if(!m) throw new Error('周次格式示例：1-16、1,3,5、1-16(单)');const start=Number(m[1]),end=Number(m[2]||m[1]);if(start<1||end>30||start>end)throw new Error('周次须在 1–30 范围内');for(let n=start;n<=end;n++)if(!parity||(n%2===1)===(parity==='odd'))out.add(n);}
  return [...out].sort((a,b)=>a-b);
}
export function normalizeCell(value) {
  if(value==null)return '';
  if(value instanceof Date) return value.toISOString().slice(0,10);
  if(typeof value==='object') {if(value.result!=null)return normalizeCell(value.result);if(value.richText)return value.richText.map(x=>x.text).join('');if(value.text)return value.text;}
  return String(value).trim();
}
export function timeCell(v) {
  if(v&&typeof v==='object'&&!(v instanceof Date)&&v.result!=null)return timeCell(v.result);
  if(v instanceof Date) return v.toISOString().slice(11,16);
  if(typeof v==='number' && v>=0&&v<1) {const m=Math.round(v*1440);return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;}
  const s=normalizeCell(v).replace('：',':');const m=s.match(/^(\d{1,2}):(\d{2})(?::00)?$/);return m?`${m[1].padStart(2,'0')}:${m[2]}`:s;
}
export function convertRows(table,semesterMonday='') {
  if(!table.length) throw new Error('文件中没有数据');
  const header=table[0].map(normalizeCell);const idx=name=>header.indexOf(name);
  for(const h of ['场地','开始时间','结束时间','课程名称']) if(idx(h)<0)throw new Error(`缺少“${h}”列。请使用导入模板；原始合并课表需要先整理为每行一节课。`);
  const rows=[],errors=[];
  for(let i=1;i<table.length;i++) {
    const values=table[i];if(!values.some(x=>normalizeCell(x)))continue;
    const get=h=>values[idx(h)]??'';
    try {
      const venue=({'操场':'field','体育馆':'gym',field:'field',gym:'gym'})[normalizeCell(get('场地'))];
      const input={venue,start:timeCell(get('开始时间')),end:timeCell(get('结束时间')),title:normalizeCell(get('课程名称')),organization:'体育部'};
      let date=normalizeCell(get('日期')).replace(/\//g,'-');
      if(date) {rows.push({...normalizeBooking({...input,date}),sourceRow:i+1});}
      else {
        if(!validDate(semesterMonday)||weekday(semesterMonday)!==0)throw new Error('按周次导入时，请设置第 1 周星期一日期');
        const wd=normalizeCell(get('星期')).replace(/星期|周/g,'');const d=({'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'日':7,'天':7})[wd]||Number(wd);
        if(!Number.isInteger(d)||d<1||d>7)throw new Error('星期须为 1–7（周一至周日）');
        for(const w of parseWeeks(get('周次'))) rows.push({...normalizeBooking({...input,date:addDays(semesterMonday,(w-1)*7+d-1)}),sourceRow:i+1});
      }
    }catch(e){errors.push(`第 ${i+1} 行：${e.message}`);}
  }
  if(rows.length>2000)errors.push('展开后超过 2000 条，请分批导入');
  if(!rows.length&&!errors.length)errors.push('没有可导入的课程行');
  return {rows,errors};
}
