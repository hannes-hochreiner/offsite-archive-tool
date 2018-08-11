export class Controller {
  constructor(repo, conf, utils) {
    this._repo = repo;
    this._conf = conf;
    this._utils = utils;
  }

  async _getChangeTimeOfRemoteFile(filename) {
    let { stdout, stderr } = await this._utils.exec(`ssh ${this._conf.ssh.user}@${this._conf.ssh.host} -i ${this._conf.ssh.idFile} "ls -l --full-time ${filename}"`);
    let lt = stdout.split('\n')[0].split(' ');

    if (lt[lt.length - 1] !== filename) {
      throw new Error('could not get information on remote file');
    }

    return (new Date(`${lt[lt.length - 4]} ${lt[lt.length - 3]} ${lt[lt.length - 2]}`)).toISOString();
  }

  async _getLastLineOfRemoteFile(filename) {
    let { stdout, stderr } = await this._utils.exec(`ssh ${this._conf.ssh.user}@${this._conf.ssh.host} -i ${this._conf.ssh.idFile} "tail -n 1 ${filename}"`);

    return stdout;
  }

  async startHashing(doc) {
    doc.hashing = {};
    doc.hashing.filename = `${doc.id}.hash`;
    let { stdout, stderr } = await this._utils.exec(`ssh ${this._conf.ssh.user}@${this._conf.ssh.host} -i ${this._conf.ssh.idFile} "sha256sum -b ${doc.compression.filename} </dev/null &>${doc.hashing.filename} &"`);
    doc.stage = 'hashing';
    await this._repo.putUpload(doc);
  }

  async doPeriodicCheck() {
    (await this._repo.getAllUploads()).filter(elem => {
      return elem.status === 'ok';
    }).forEach(async elem => {
      if (elem.stage === 'initialized') {
        await this.startCompression(elem);
      } else if (elem.stage === 'compressing') {
        let ll = await this._getLastLineOfRemoteFile(elem.compression.logFilename);

        if (ll === 'Everything is Ok\n') {
          this.startHashing(elem);
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
    let old7zProcesses = await this._utils.get7zProcesses(this._conf.ssh.user, this._conf.ssh.idFile, this._conf.ssh.host);

    doc.compression = {};
    doc.compression.password = await this._utils.getRandomString(20);

    let res = await this._utils.create7zArchive(this._conf.ssh.user, this._conf.ssh.idFile, this._conf.ssh.host, doc.id, doc.uri, doc.compression.password);

    doc.compression.filename = res.archiveFilename;
    doc.compression.logFilename = res.archiveLogFilename;

    let new7zProcesses = await this._utils.get7zProcesses(this._conf.ssh.user, this._conf.ssh.idFile, this._conf.ssh.host);

    doc.compression.pid = new7zProcesses.find(entry => {
      return !old7zProcesses.includes(entry);
    }).split(' ')[0];
    doc.stage = 'compressing';

    await this._repo.putUpload(doc);
  }
}
