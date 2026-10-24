const {withAndroidManifest}=require('expo/config-plugins');
/** Release builds never permit cleartext API traffic or Android backup of local drafts. */
module.exports=(config,{allowDevelopmentHttp=false}={})=>withAndroidManifest(config,config=>{
 const application=config.modResults.manifest.application?.[0];
 if(!application)throw new Error('Android application manifest was not generated');
 application.$=application.$||{};
 application.$['android:usesCleartextTraffic']=allowDevelopmentHttp?'true':'false';
 application.$['android:allowBackup']='false';
 return config;
});
