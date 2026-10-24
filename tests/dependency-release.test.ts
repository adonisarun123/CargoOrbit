import {createRequire} from 'node:module';
import {describe,it,expect} from 'vitest';
const require=createRequire(import.meta.url);

describe('patched Expo CLI Zod compatibility',()=>{
 it('validates developer extension schemas and command schemas with the patched major version',()=>{
  const {PluginSchema,DevToolsPluginOutputSchema}=require('@expo/cli/build/src/start/server/DevToolsPlugin.schema.js');
  const {createMCPDevToolsExtensionSchema}=require('@expo/cli/build/src/start/server/createMCPDevToolsExtensionSchema.js');
  const plugin=PluginSchema.parse({packageName:'release-check',packageRoot:'/workspace/check',cliExtensions:{description:'Release check',entryPoint:'index.js',commands:[{name:'status',title:'Read status',environments:['cli','mcp'],parameters:[{name:'count',type:'number',description:'Maximum records'}]}]}});
  const command=createMCPDevToolsExtensionSchema(plugin);
  expect(command.parse({command:'status',count:2})).toEqual({command:'status',count:2});
  expect(command.safeParse({command:'unknown'}).success).toBe(false);
  expect(command.safeParse({command:'status',count:'wrong'}).success).toBe(false);
  expect(DevToolsPluginOutputSchema.parse([{type:'text',text:'Ready',level:'info'}])).toHaveLength(1);
  expect(PluginSchema.safeParse({packageName:'',packageRoot:'/workspace/check'}).success).toBe(false);
 });
});
