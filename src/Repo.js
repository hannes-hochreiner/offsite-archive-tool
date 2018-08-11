export class Repo {
  constructor(pdb) {
    this._pdb = pdb;
  }

  async putUpload(doc) {
    doc._id = `uploads/${doc.id}`;
    await this._pdb.put(doc);
  }

  async getUploadById(id) {
    return await this._pdb.get(`uploads/${id}`);
  }

  async getAllUploads() {
    return (await this._pdb.allDocs({
      include_docs: true,
      startkey: 'uploads/',
      endkey: 'uploads/\ufff0'
    })).rows.map(entry => entry.doc);
  }

  async deleteUpload(id) {
    return await this._pdb.remove(await this.getUploadById(id));
  }
}
