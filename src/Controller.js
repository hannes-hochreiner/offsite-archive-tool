export class Controller {
  constructor(repo, conf, utils, glacier) {
    this._repo = repo;
    this._conf = conf;
    this._utils = utils;
    this._glacier = glacier;
  }

  async doPeriodicCheck() {
    (await this._repo.getAllUploads()).filter(elem => {
      return elem.status === 'ok';
    }).forEach(async elem => {
      try {
        if (elem.stage === 'initialized') {
          await this.startCompression(elem);
        } else if (elem.stage === 'compressing') {
          let ll = await this._utils.spawnRemoteCommand(this._conf.ssh, `tail -n 1 ${elem.compression.logFilename}`);
  
          if (ll === 'Everything is Ok\n') {
            await this.startHashing(elem);
          }
        } else if (elem.stage === 'hashing') {
          // check whether the hashing process is still running
          let resPs = await this._utils.spawnRemoteCommand(this._conf.ssh, 'ps -Ao pid');
  
          if (!resPs.split('\n').includes(elem.hashing.pid)) {
            // check whether the file containing the hash has been created
            let resLs = await this._utils.spawnRemoteCommand(this._conf.ssh, `ls ${elem.hashing.filename}`);
  
            if (resLs.trim() !== '') {
              // start transfer
              await this.startTransfer(elem);
            } else {
              // error
            }
          }
        } else if (elem.stage === 'transferring') {
          // check whether the transfer process is still running
          let resPs = await this._utils.execCommand('ps -Ao pid');
  
          if (!resPs.split('\n').includes(elem.transfer.pid)) {
            // check whether the file has been created
            let resLs = await this._utils.execCommand(`ls ${this._conf.workingDirectory}/${elem.compression.filename}`);
  
            if (resLs.trim() !== '') {
              // start hash check
              await this.startHashCheck(elem);
            } else {
              // error
            }
          }
        } else if (elem.stage === 'checking_hash') {
          let remoteProm = this._utils.spawnRemoteCommand(this._conf.ssh, `cat ${elem.hashing.filename}`);
          let hashFileLocal = await this._utils.readFile(elem.hashCheck.filename);
          let hashLocal = hashFileLocal.split('\n')[0].split(' ')[0];
          let hashFileRemote = await remoteProm;
          let hashRemote = hashFileRemote.split('\n')[0].split(' ')[0];

          if (hashLocal === hashRemote) {
            await this.startUpload(elem);
          }
        }
      } catch (error) {
        console.log(error.error || error);
        console.log(error.stderr || '');
      }
    });
  }

  async getAllUploads() {
    return await this._repo.getAllUploads();
  }

  async postUpload(doc) {
    doc.id = this._utils.uuid();
    doc.stage = 'initialized';
    doc.status = 'ok';
    await this._repo.putUpload(doc);

    return doc.id;
  }

  async deleteUpload(id) {
    await this._repo.deleteUpload(id);
  }

  async startCompression(doc) {
    doc.compression = {};
    doc.compression.password = await this._utils.getRandomString(20);
    doc.compression.filename = `${doc.id}.7z`;
    doc.compression.logFilename = `${doc.id}.log`;
    doc.compression.pid = (await this._utils.spawnRemoteCommand(
      this._conf.ssh,
      `7z a -t7z -mhe=on -p${doc.compression.password} ${doc.compression.filename} ${doc.uri} </dev/null &>${doc.compression.logFilename} & echo $!`
    )).trim();
    doc.stage = 'compressing';

    await this._repo.putUpload(doc);
  }

  async startHashing(doc) {
    doc.hashing = {};
    doc.hashing.filename = `${doc.id}.hash`;
    doc.hashing.pid = (await this._utils.spawnRemoteCommand(
      this._conf.ssh,
      `sha256sum -b ${doc.compression.filename} </dev/null &>${doc.hashing.filename} & echo $!`
    )).trim();
    doc.stage = 'hashing';

    await this._repo.putUpload(doc);
  }

  async startTransfer(doc) {
    doc.transfer = {};
    doc.transfer.filename = `${this._conf.workingDirectory}/${doc.compression.filename}`;
    doc.transfer.pid = (await this._utils.spawnDetached('scp', [
      '-i',
      this._conf.ssh.idFile,
      `${this._conf.ssh.user}@${this._conf.ssh.host}:${doc.compression.filename}`,
      doc.transfer.filename
    ])).trim();
    doc.stage = 'transferring';

    await this._repo.putUpload(doc);
  }

  async startHashCheck(doc) {
    doc.hashCheck = {};
    doc.hashCheck.filename = `${this._conf.workingDirectory}/${doc.id}.hash`;
    doc.hashCheck.pid = (await this._utils.execCommand(`sha256sum -b ${this._conf.workingDirectory}/${doc.compression.filename} </dev/null 2>/dev/null 1>${doc.hashCheck.filename} & echo $!`)).trim();
    doc.stage = 'checking_hash';

    await this._repo.putUpload(doc);
  }

  async startUpload(doc) {
    doc.upload = {};
    doc.upload.size = (await this._utils.statFile(doc.transfer.filename)).size;
    doc.upload.partSize = this._calculatePartSize(doc.upload.size);

    // initialize the multi-part upload
    let awsRes = await this._glacier.initiateMultipartUpload({
      accountId: "-", 
      partSize: `${doc.upload.partSize}`, 
      vaultName: this._conf.aws.vaultName
    }).promise();

    doc.upload.aws = {
      location: awsRes.location,
      uploadId: awsRes.uploadId
    };
    doc.stage = 'uploading';

    await this._repo.putUpload(doc);

    // initialize the upload parts
    for (let cntr = 0; cntr < doc.upload.size; cntr += doc.upload.partSize) {
      let up = {
        id: this._utils.uuid(),
        uploadId: doc.id,
        aws: {
          uploadId: doc.upload.aws.uploadId,
          vaultName: this._conf.aws.vaultName
        },
        start: cntr,
        end: Math.min(cntr + doc.upload.partSize, doc.upload.size) - 1,
        status: 'initialized',
        log: [{timestamp: this._utils.getTimestamp(), message: 'initialized'}]
      };

      await this._repo.putUploadPart(up);
    }
  }

  _calculatePartSize(size) {
    let mega = 1024 * 1024;
    let minSize = Math.ceil(size / 10000);

    if (minSize < mega) {
      return mega;
    }

    let minSizeM = Math.pow(2, Math.ceil(Math.log2(minSize / mega)));

    if (minSizeM > 4000) {
      throw Error('file too large');
    }

    return minSizeM * mega;
  }
}
