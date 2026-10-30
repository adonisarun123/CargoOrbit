import type {ConfigContext,ExpoConfig} from 'expo/config';
export default ({config}:ConfigContext):ExpoConfig=>{
 const profile=process.env.EAS_BUILD_PROFILE||'';
 const diagnostics=profile==='diagnostics';
 const requestedDiagnostics=process.env.EXPO_PUBLIC_NATIVE_DIAGNOSTICS==='true';
 if(requestedDiagnostics!==diagnostics)throw new Error('Native diagnostics require their isolated diagnostics build profile; never enable them in a driver release.');
 const release=profile==='production'||profile==='preview'||diagnostics;
 const api=process.env.EXPO_PUBLIC_API_URL;
 if(release){if(!api)throw new Error('Set EXPO_PUBLIC_API_URL in the build environment before a release build');const url=new URL(api);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('Release API origin must use HTTPS without credentials or query parameters');}
 const allowDevelopmentHttp=!release&&process.env.CARGOORBIT_ALLOW_DEV_HTTP==='true';
 return {...config,name:diagnostics?'FreyTara Native Checks':'FreyTara Driver',slug:'cargoorbit-driver',android:{...config.android,package:diagnostics?'com.cargoorbit.driver.test':'com.cargoorbit.driver',blockedPermissions:[...new Set([...(config.android?.blockedPermissions||[]),'android.permission.READ_EXTERNAL_STORAGE','android.permission.WRITE_EXTERNAL_STORAGE','android.permission.SYSTEM_ALERT_WINDOW','android.permission.RECORD_AUDIO'])]},plugins:[...(config.plugins||[]),['./plugins/with-release-network.js',{allowDevelopmentHttp}],'./plugins/with-production-signing.js','./plugins/with-android-compile-sdk.js']};
};
