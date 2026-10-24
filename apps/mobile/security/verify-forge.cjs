'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const crypto=require('node:crypto');
const vector=require('./forge-regression.json');

function verifyForge(directory,{expectVulnerable=false}={}){
 const forge=require(path.join(directory,'lib/index.js')),checks=[];
 const check=(name,fn)=>{fn();checks.push(name);};
 const publicKey=forge.pki.rsa.setPublicKey(new forge.jsbn.BigInteger(vector.modulusHex,16),new forge.jsbn.BigInteger(vector.exponent));
 const digest=forge.md.sha256.create().update(vector.message).digest().getBytes(),signature=forge.util.hexToBytes(vector.signatureHex);
 let accepted=false;try{accepted=publicKey.verify(digest,signature);}catch(error){assert.match(error.message,/valid RSASSA-PKCS1-v1_5 DigestInfo/);}
 assert.equal(accepted,expectVulnerable,'Upstream CVE regression must reject the malformed DigestAlgorithm with normal padding checks enabled.');
 checks.push(expectVulnerable?'vulnerable baseline reproduced':'upstream nested DigestAlgorithm vector rejected');
 if(expectVulnerable)return {checks,advisoryMitigated:false};
 const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048,publicExponent:65537});
 const pem=pair.privateKey.export({type:'pkcs1',format:'pem'}),pubPem=pair.publicKey.export({type:'spki',format:'pem'});
 const privateKey=forge.pki.privateKeyFromPem(pem),pub=forge.pki.publicKeyFromPem(pubPem),message='CargoOrbit signing compatibility regression';
 for(const algorithm of ['sha256','sha384','sha512']){
  check(algorithm+' native signature verifies',()=>{const signed=crypto.sign(algorithm,Buffer.from(message),pair.privateKey);assert.equal(pub.verify(forge.md[algorithm].create().update(message).digest().getBytes(),signed.toString('binary')),true);});
  check(algorithm+' forge signature verifies natively',()=>{const signed=privateKey.sign(forge.md[algorithm].create().update(message));assert.equal(crypto.verify(algorithm,Buffer.from(message),pair.publicKey,Buffer.from(signed,'binary')),true);});
  check(algorithm+' altered message rejected',()=>{const signed=privateKey.sign(forge.md[algorithm].create().update(message));assert.equal(pub.verify(forge.md[algorithm].create().update(message+' changed').digest().getBytes(),signed),false);});
 }
 check('RSA-PSS SHA256 remains compatible',()=>{const scheme=()=>forge.pss.create({md:forge.md.sha256.create(),mgf:forge.mgf.mgf1.create(forge.md.sha256.create()),saltLength:32});const signed=privateKey.sign(forge.md.sha256.create().update(message),scheme());assert.equal(pub.verify(forge.md.sha256.create().update(message).digest().getBytes(),signed,scheme()),true);assert.equal(crypto.verify('sha256',Buffer.from(message),{key:pair.publicKey,padding:crypto.constants.RSA_PKCS1_PSS_PADDING,saltLength:32},Buffer.from(signed,'binary')),true);});
 check('valid X509 certificate survives PEM roundtrip',()=>{const certificate=forge.pki.createCertificate();certificate.publicKey=pub;certificate.serialNumber='01';certificate.validity.notBefore=new Date('2026-01-01T00:00:00Z');certificate.validity.notAfter=new Date('2027-01-01T00:00:00Z');const subject=[{name:'commonName',value:'cargoorbit-test.invalid'}];certificate.setSubject(subject);certificate.setIssuer(subject);certificate.setExtensions([{name:'basicConstraints',cA:true}]);certificate.sign(privateKey,forge.md.sha256.create());const parsed=forge.pki.certificateFromPem(forge.pki.certificateToPem(certificate));assert.equal(parsed.verify(parsed),true);assert.equal(new crypto.X509Certificate(forge.pki.certificateToPem(parsed)).verify(pair.publicKey),true);});
 check('valid CSR verifies after roundtrip',()=>{const csr=forge.pki.createCertificationRequest();csr.publicKey=pub;csr.setSubject([{name:'commonName',value:'cargoorbit-test.invalid'}]);csr.sign(privateKey,forge.md.sha256.create());assert.equal(forge.pki.certificationRequestFromPem(forge.pki.certificationRequestToPem(csr)).verify(),true);});
 check('PKCS8 encrypted private key remains usable',()=>{const encrypted=forge.pki.encryptRsaPrivateKey(privateKey,'test-only-password',{algorithm:'aes256'});assert.equal(forge.pki.decryptRsaPrivateKey(encrypted,'test-only-password').n.toString(16),pub.n.toString(16));});
 return {checks,advisoryMitigated:true,upstreamPatched:false,independentReviewRequired:true};
}
module.exports={verifyForge};
if(require.main===module){try{const directory=process.argv[2]?path.resolve(process.argv[2]):path.dirname(require.resolve('node-forge/package.json'));console.log(JSON.stringify(verifyForge(directory,{expectVulnerable:process.argv.includes('--expect-vulnerable')}),null,2));}catch(error){console.error(error.stack);process.exitCode=1;}}
