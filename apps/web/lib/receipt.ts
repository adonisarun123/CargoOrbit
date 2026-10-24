/** Convert a canonical stored receipt back to editable input without losing approved entered units. */
export function editableReceiptLines(lines:Record<string,any>[]=[]){
 return lines.map(line=>{const entered=line.entered||line;return {lineId:line.lineId,accepted:entered.accepted,damaged:entered.damaged,rejected:entered.rejected,short:entered.short,...(entered.unit?{unit:entered.unit}:{})}});
}
