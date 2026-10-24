import { writeFile } from 'node:fs/promises';
const response=await fetch(process.env.OPENAPI_URL??'http://localhost:4000/v1/docs-json');
if(!response.ok) throw new Error(`OpenAPI download failed: ${response.status}`);
await writeFile('docs/openapi.json',JSON.stringify(await response.json(),null,2)+'\n');
