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

const gpg = require('./gpg-api');
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
    reqOpt.encoding = null; // res.body will be a buffer and not a string
    let res = await super.download(reqOpt);
    if (res.statusCode != 200) {
      return res;
    }

    let source = reqOpt.uri || reqOpt.url;

    let keys = objectPath.get(this.data, ['object', 'spec', 'keys']);
    this.log.debug('Fetching keys:', JSON.stringify(keys));

    if (Array.isArray(keys)) {
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
        this.log.debug('Keys found', JSON.stringify(gpgKey));
        if (gpgKey) {
          try {
            await gpg.importPrivateKey(gpgKey);
          } catch (e) {
            this.log.error(e, 'import keys failed');
            return Promise.reject({ statusCode: 500, message: 'import keys failed.. see logs for details.', url: source });
          }
        }
      }
    }

    try {
      this.log.debug(`Downloaded from ${source}`);
      if (source.includes('.gpg')) {
        this.log.debug(`Decrypting ${reqOpt.uri || reqOpt.url}`);
        res.body = await gpg.decryptBuffer(res.body);
        this.log.debug(`Decrypting Succeeded ${reqOpt.uri || reqOpt.url}`);
      }
      if (source.includes('.tar') || source.includes('.tgz')) {
        res.body = await this.uncompress(res.body);
      }
      return res;
    } catch (error) {
      this.log.error(error, 'decryption failed');
      return Promise.reject({ statusCode: 500, message: 'decryption failed.. see logs for details.', url: source });
    }
  }
};
