const crypto = require('crypto');

function generateVAPIDKeys() {
    var curve = crypto.createECDH('prime256v1');
    curve.generateKeys();

    return {
    publicKey: curve.getPublicKey(),
    privateKey: curve.getPrivateKey(),
    };
}

const keys = generateVAPIDKeys();
console.log('Public Key (Buffer):', keys.publicKey);
console.log('Private Key (Buffer):', keys.privateKey);

// To get as Uint8Array
const publicKeyArray = Array.from(keys.publicKey);
console.log('Public Key as Uint8Array:', publicKeyArray);