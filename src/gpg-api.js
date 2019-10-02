/******************************************************************************
 * Licensed Materials - Property of IBM
 * IBM Bluemix Container Service, 5737-D43
 * (C) Copyright IBM Corp. 2017 All Rights Reserved.
 * US Government Users Restricted Rights - Use, duplication or
 * disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
 ******************************************************************************/

const fs = require('fs');
const gpg = require('gpg');

function createGPGKey(clusterInfo) {
  return new Promise(function (resolve, reject) {
    const keyIdentifier = clusterInfo.cluster_name + '@oneibmcloud.com';
    const keyScript = '%no-protection\nKey-Type: 1\nKey-Length: 4096\nSubkey-Type: 1\nSubkey-Length: 4096\nName-Real: Root Superuser\nName-Email: ' + keyIdentifier + '\nExpire-Date: 0';
    fs.writeFile('/tmp/gen-key-script', keyScript, (err) => {
      if (err) return reject(err);

      gpg.call('', ['--batch', '--gen-key', '/tmp/gen-key-script'], function (err, msg, error) {
        if (err) {
          return reject(err);
        } else if (error != '' && !msg) {
          return reject(error);
        }
        resolve(keyIdentifier);
      });
    });
  });
}

function removePublicKey(keyIdentifier) {
  return new Promise(function (resolve, reject) {
    gpg.call('', ['--batch', '--delete-keys', keyIdentifier], function (err, msg, error) {
      if (err) {
        return reject(err);
      } else if (error != '' && !msg) {
        return reject(error);
      }
      resolve(msg.toString('utf8'));
    });
  });
}

function exportPrivateKey(keyIdentifier) {
  return new Promise(function (resolve, reject) {
    gpg.call('', ['--export-secret-key', '-a', keyIdentifier], function (err, msg, error) {
      if (err) {
        return reject(err);
      } else if (error != '' && !msg) {
        return reject(error);
      }
      resolve(msg.toString('utf8'));
    });
  });
}

function exportPublicKey(keyIdentifier) {
  return new Promise(function (resolve, reject) {
    gpg.call('', ['--export', '-a', keyIdentifier], function (err, msg, error) {
      if (err) {
        return reject(err);
      } else if (error != '' && !msg) {
        return reject(error);
      }
      resolve(msg.toString('utf8'));
    });
  });
}

function importPrivateKey(privateKey) {
  return new Promise(function (resolve, reject) {
    fs.writeFile('/tmp/importing-private-key.key', privateKey, (err) => {
      if (err) return reject(err);

      gpg.call('', ['--import', '/tmp/importing-private-key.key'], function (err, msg, error) {
        if (err) {
          if (!err.toString().includes('already in secret keyring')) {
            return reject(err);
          }
        } else if (error != '' && !msg) {
          return reject(error);
        }
        resolve(msg);
      });
    });
  });
}

function decryptBuffer(buffer) {
  return new Promise(function (resolve, reject) {
    if (buffer) {
      gpg.decrypt(buffer, ['--trust-model', 'always'], function (err, decrypted, error) {
        if (err) {
          return reject(err);
        } else if (error != '' && !decrypted) {
          return reject(error);
        }
        resolve(decrypted);
      });
    } else {
      resolve();
    }
  });
}

module.exports = {
  createGPGKey,
  exportPrivateKey,
  exportPublicKey,
  importPrivateKey,
  decryptBuffer,
  removePublicKey
};
