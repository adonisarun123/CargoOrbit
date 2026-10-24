import {expect,it} from 'vitest';
import {parseCsv,importRows} from '../apps/web/lib/csv';
it('parses commas, quotes, CRLF and multiline quoted cells',()=>{expect(parseCsv('name,note\r\n"A, B","one\ntwo ""quoted"""\r\n')).toEqual([{name:'A, B',note:'one\ntwo "quoted"'}])});
it('rejects malformed columns and ambiguous headers',()=>{expect(()=>parseCsv('a,a\n1,2')).toThrow();expect(()=>parseCsv('a,b\n1')).toThrow();expect(()=>parseCsv('a\n"unclosed')).toThrow()});
it('maps a simple CSV shipment line',()=>{expect(importRows('lrNumber,description,quantity,unit\nL1,Parts,12,pcs')[0].lines).toEqual([{description:'Parts',quantity:'12',unit:'pcs'}])});
