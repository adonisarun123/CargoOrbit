import type {ConfigContext,ExpoConfig} from 'expo/config';
export default ({config}:ConfigContext):ExpoConfig=>{
 const profile=process.env.EAS_BUILD_PROFILE||'';
 const release=profile==='production'||profile==='preview';
 const api=process.env.EXPO_PUBLIC_API_URL;
 if(release){if(!api)throw new Error('Set EXPO_PUBLIC_API_URL in the EAS environment before a release build');const url=new URL(api);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('Release API origin must use HTTPS without credentials or query parameters');}
 const allowDevelopmentHttp=!release&&process.env.CARGOORBIT_ALLOW_DEV_HTTP==='true';
 return {...config,name:'CargoOrbit Driver',slug:'cargoorbit-driver',plugins:[...(config.plugins||[]),['./plugins/with-release-network.js',{allowDevelopmentHttp}]]};
};
