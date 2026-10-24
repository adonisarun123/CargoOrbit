import {expect,it} from 'vitest';
import {editableReceiptLines} from '../apps/web/lib/receipt';
it('reopens a converted draft in its entered unit without multiplying normalized quantities again',()=>{
 expect(editableReceiptLines([{lineId:'item',accepted:'120',damaged:'12',rejected:'0',short:'12',entered:{unit:'box',accepted:'10',damaged:'1',rejected:'0',short:'1',factor:'12',reason:'Approved carton size'}}])).toEqual([{lineId:'item',unit:'box',accepted:'10',damaged:'1',rejected:'0',short:'1'}]);
});
it('preserves base-unit dispositions while excluding canonical metadata rejected by strict input schemas',()=>{
 expect(editableReceiptLines([{lineId:'item',accepted:'8.5',damaged:'0',rejected:'1',short:'0.5',expectedQuantity:'10',item:{description:'Parts'}}])).toEqual([{lineId:'item',accepted:'8.5',damaged:'0',rejected:'1',short:'0.5'}]);expect(editableReceiptLines()).toEqual([]);
});
