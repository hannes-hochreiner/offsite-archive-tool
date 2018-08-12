export class Controller {
  constructor(repo, conf, utils) {
    this._repo = repo;
    this._conf = conf;
    this._utils = utils;
  }

  async doPeriodicCheck() {
    (await this._repo.getAllUploads()).filter(elem => {
      return elem.status === 'ok';
    }).forEach(async elem => {
      if (elem.stage === 'initialized') {
        await this.startCompression(elem);
      } else if (elem.stage === 'compressing') {
        let ll = await this._utils.spawnRemoteCommand(this._conf.ssh, `tail -n 1 ${elem.compression.logFilename}`);

        if (ll === 'Everything is Ok\n') {
          await this.startHashing(elem);
        }
      } else if (elem.stage === 'hashing') {
        // check whether the hashing process is still running
        let resPs = await this._utils.spawnRemoteCommand(this._conf.ssh, `ps -Ao pid | grep ${elem.hashing.pid}`);

        if (resPs.trim() === '') {
          // check whether the file containing the hash has been created
          let resLs = await this._utils.spawnRemoteCommand(this._conf.ssh, `ls ${elem.hashing.filename}`);

          if (resLs.trim() !== '') {
            // start transfer
            await this.startTransfer(elem);
          } else {
            // error
          }
        }
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
    doc.transfer.pid = (await this._utils.spawnDetached('scp', [
      '-i',
      this._conf.ssh.idFile,
      `${this._conf.ssh.user}@${this._conf.ssh.host}:${doc.compression.filename}`,
      `${this._conf.workingDirectory}/${doc.compression.filename}`
    ])).trim();
    doc.stage = 'transferring';

    await this._repo.putUpload(doc);
  }
}
