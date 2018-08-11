export class Controller {
  constructor(repo, conf, uuidFunc, randomStringFunc, zProcFunc, zArchiveFunc) {
    this._repo = repo;
    this._conf = conf;
    this._uuid = uuidFunc;
    this._randomString = randomStringFunc;
    this._zProcFunc = zProcFunc;
    this._zArchiveFunc = zArchiveFunc;
  }

  async getAllUploads() {
    return await this._repo.getAllUploads();
  }

  async postUpload(doc) {
    doc.id = this._uuid();
    doc.stage = 'initialized';
    doc.status = 'ok';
    await this._repo.putUpload(doc);

    return doc.id;
  }

  async deleteUpload(id) {
    await this._repo.deleteUpload(id);
  }

  async startCompression(doc) {
    let old7zProcesses = await this._zProcFunc(this._conf.ssh.user, this._conf.ssh.idFile, this._conf.ssh.host);

    doc.compression = {};
    doc.compression.password = await this._randomString(20);

    let res = await this._zArchiveFunc(this._conf.ssh.user, this._conf.ssh.idFile, this._conf.ssh.host, doc.id, doc.uri, doc.compression.password);

    doc.compression.filename = res.archiveFilename;
    doc.compression.logFilename = res.archiveLogFilename;

    let new7zProcesses = await this._zProcFunc(this._conf.ssh.user, this._conf.ssh.idFile, this._conf.ssh.host);

    doc.compression.pid = new7zProcesses.find(entry => {
      return !old7zProcesses.includes(entry);
    }).split(' ')[0];
    doc.stage = 'compressing';

    await this._repo.putUpload(doc);
  }
}
