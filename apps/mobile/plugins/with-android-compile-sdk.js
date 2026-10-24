const {withProjectBuildGradle}=require('expo/config-plugins');

// Expo keeps compileSdkVersion as an Int. AGP's separate minor API property
// selects Google's android-37.0 platform without changing the SDK installation.
module.exports=config=>withProjectBuildGradle(config,config=>{
 if(config.modResults.language!=='groovy')throw new Error('Review Android compile SDK plugin for the generated Gradle language.');
 const marker='// CargoOrbit explicit compile SDK minor API';
 const source=config.modResults.contents;
 if(source.includes(marker))return config;
 // ReactRootProjectPlugin can evaluate :app during apply; register before it.
 const anchor='apply plugin: "com.facebook.react.rootproject"';
 if(!source.includes(anchor))throw new Error('Unexpected Expo root Gradle template; refusing an unreviewed compile SDK configuration.');
 const block=`${marker}
subprojects { nativeProject ->
    ['com.android.application', 'com.android.library'].each { androidPlugin ->
        nativeProject.plugins.withId(androidPlugin) {
            nativeProject.extensions.getByName('androidComponents').finalizeDsl { android ->
                if (android.compileSdk == 37) {
                    android.compileSdkMinor = 0
                }
            }
        }
    }
}

`;
 config.modResults.contents=source.replace(anchor,block+anchor);
 return config;
});
