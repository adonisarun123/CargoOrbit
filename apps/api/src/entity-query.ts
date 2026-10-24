import type {Entity,Transaction} from '@cargoorbit/database';

/** Decisions and immutable snapshots must inspect every matching row, not a presentation page. */
export async function allMatching<T extends Entity=Entity>(tx:Transaction,kind:string,where:Record<string,unknown>={}):Promise<T[]>{
 const records:T[]=[];let cursor:string|undefined;
 do{const page=await tx.page<T>(kind,{where,limit:500,cursor});records.push(...page.items);cursor=page.nextCursor;}while(cursor);
 return records;
}
