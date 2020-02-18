/**
 * Copyright 2019 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const openpgp = require('openpgp');
const loggerFactory = require('./bunyan-api');
const gunzip = require('gunzip-maybe');
const objectPath = require('object-path');
const Readable = require('stream').Readable;
const tar = require('tar-stream');
const { RemoteResourceS3Controller } = require('@razee/remoteresources3');

module.exports = class RemoteResourceS3DecryptController extends RemoteResourceS3Controller {
  constructor(params) {
    params.logger = params.logger || loggerFactory.createLogger('RemoteResourceS3DecryptController');
    super(params);
  }

  async uncompress(data) {
    this.log.debug('uncompress');
    return new Promise((resolve, reject) => {
      let extract = tar.extract();
      let delimiter = '';
      let unpackedData = '';
      let rs = new Readable;
      rs.push(data);
      rs.push(null);
      rs.pipe(gunzip()).pipe(extract);
      extract.on('entry', (header, stream, next) => {
        let buffers = [];
        stream.on('data', (data) => buffers.push(data));
        stream.on('error', reject);
        stream.on('end', () => {
          let entryBuffer = Buffer.concat(buffers);
          unpackedData += delimiter;
          unpackedData += entryBuffer.toString('ascii');
          delimiter = '---\n';
          next();
        });
        extract.on('finish', () => {
          resolve(unpackedData);
        });
      });
    });
  }

  async download(reqOpt) {
    // disable response encoding, so that res.body is Buffer type
    reqOpt.encoding = null;
    // get full response payload to avoid http chunked data
    reqOpt.resolveWithFullResponse = true;
    let res = await super.download(reqOpt);
    if (res.statusCode != 200) {
      return res;
    }

    let source = reqOpt.uri || reqOpt.url;

    let isBinary = false;
    if (res.headers['content-type'] === 'binary/octet-stream') {
      isBinary = true;
    } else {
      // if response is not binary, reset body to utf-8 string
      res.body = res.body.toString('utf8');
    }
    let alpha1Keys = objectPath.get(this.data, ['object', 'spec', 'keys'], []);
    let objKeys = objectPath.get(this.data, ['object', 'spec', 'gpg', 'privateKeyRefs'], []);
    let strKeys = objectPath.get(this.data, ['object', 'spec', 'gpg', 'privateKeys'], []);
    let keys = alpha1Keys.concat(objKeys, strKeys);
    this.log.debug('Fetching keys:', JSON.stringify(keys));
    let options = { privateKeys: [] };

    if (keys.length > 0) {
      for (var i = 0, len = keys.length; i < len; i++) {
        let gpgKey;
        if (typeof keys[i] == 'object') {
          let secretName = objectPath.get(keys[i], ['valueFrom', 'secretKeyRef', 'name']);
          let secretNamespace = objectPath.get(keys[i], ['valueFrom', 'secretKeyRef', 'namespace']);
          let key = objectPath.get(keys[i], ['valueFrom', 'secretKeyRef', 'key']);
          gpgKey = await this._getSecretData(secretName, key, secretNamespace);
        } else {
          gpgKey = keys[i];
        }

        if (gpgKey) {
          const privKeyObj = await openpgp.key.readArmored(gpgKey.replace(/^[^\S\r\n]+/gm, ''));
          if (privKeyObj.err) {
            this.log.error(privKeyObj.err);
            return Promise.reject({ statusCode: 500, message: 'import key failed.. see logs for details.', url: source });
          }
          options.privateKeys = options.privateKeys.concat(privKeyObj.keys);
        }
      }
    }
    this.log.debug('All Keys found:', options.privateKeys.map(k => k.getUserIds()));

    try {
      this.log.info(`Downloaded from ${source} type: ${Buffer.isBuffer(res.body) ? 'Buffer' : typeof res.body} length: ${res.body.length}`);
      const isCompressed = source.includes('.tar') || source.includes('.tgz');
      if (source.includes('.gpg')) {
        this.log.debug(`Decrypting ${reqOpt.uri || reqOpt.url} isBinary: ${isBinary} isCompressed: ${isCompressed}`);
        if (isBinary) {
          objectPath.set(options, 'message', await openpgp.message.read(res.body));
          objectPath.set(options, 'format', 'binary');
        } else {
          objectPath.set(options, 'message', await openpgp.message.readArmored(res.body));
        }
        let plaintext = await openpgp.decrypt(options);
        res.body = plaintext.data;
        this.log.debug(`Decrypting Succeeded ${reqOpt.uri || reqOpt.url}`);
      }
      if (isCompressed) {
        res.body = await this.uncompress(res.body);
      }
      return res;
    } catch (error) {
      this.log.error(error, 'decryption failed');
      return Promise.reject({ statusCode: 500, message: 'decryption failed.. see logs for details.', url: source });
    }
  }
};
