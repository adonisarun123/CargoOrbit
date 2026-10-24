const {withAppBuildGradle}=require('expo/config-plugins');
module.exports=config=>withAppBuildGradle(config,config=>{
 if(config.modResults.language!=='groovy')throw new Error('Review Android signing plugin for the generated Gradle language.');
 let source=config.modResults.contents;
 if(source.includes('// CargoOrbit explicit release signing'))return config;
 const release=/release \{([\s\S]*?)signingConfig signingConfigs\.debug/;
 if(!release.test(source))throw new Error('Unexpected Expo release signing template; refusing an unreviewed signing configuration.');
 source=source.replace(release,`release {$1// CargoOrbit explicit release signing\n            signingConfig System.getenv('CARGOORBIT_ANDROID_KEYSTORE') ? signingConfigs.cargoProduction : null`);
 const marker='    signingConfigs {';
 if(!source.includes(marker))throw new Error('Android signingConfigs block missing.');
 source=source.replace(marker,`${marker}
        def cargoSigningVariables = ['CARGOORBIT_ANDROID_KEYSTORE', 'CARGOORBIT_ANDROID_KEYSTORE_PASSWORD', 'CARGOORBIT_ANDROID_KEY_ALIAS', 'CARGOORBIT_ANDROID_KEY_PASSWORD']
        if (cargoSigningVariables.any { System.getenv(it) } && cargoSigningVariables.any { !System.getenv(it) }) throw new GradleException('All CargoOrbit release signing variables are required')
        if (System.getenv('CARGOORBIT_ANDROID_KEYSTORE')) {
            cargoProduction {
                storeFile file(System.getenv('CARGOORBIT_ANDROID_KEYSTORE'))
                storePassword System.getenv('CARGOORBIT_ANDROID_KEYSTORE_PASSWORD')
                keyAlias System.getenv('CARGOORBIT_ANDROID_KEY_ALIAS')
                keyPassword System.getenv('CARGOORBIT_ANDROID_KEY_PASSWORD')
            }
        }`);
 config.modResults.contents=source;return config;
});
