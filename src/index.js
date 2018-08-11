import {default as express} from 'express';
import {default as bodyParser} from 'body-parser';
import {default as commandLineArgs} from 'command-line-args';
import {default as PouchDB} from 'pouchdb';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { default as uuidv4 } from "uuid/v4";

import { Repo } from './Repo';
import { Controller } from './Controller';
import { getRandomString, get7zProcesses, create7zArchive } from "./utils";

const options = commandLineArgs([
  {name: 'port', alias: 'p', type: Number, defaultValue: 8886},
  {name: 'configuration', alias: 'c', type: String, defaultValue: `${homedir()}/.config/offsite-archive-tool/offsite-archive-tool.json`}
]);

let conf = JSON.parse(readFileSync(options.configuration, {encoding: 'utf8'}));
let pdb = new PouchDB(`${conf.workingDirectory}/oat_pdb`);
let repo = new Repo(pdb);
let controller = new Controller(repo, conf, uuidv4, getRandomString, get7zProcesses, create7zArchive);
let app = express();

app.use(bodyParser.json());
// curl localhost:8886/uploads
app.get('/uploads', async (request, response) => {
  response.send(await controller.getAllUploads());
});
// curl -d '{"uri": "test"}' localhost:8886/uploads -H "Content-Type:application/json"
app.post('/uploads', async (request, response) => {
  response.send({id: await controller.postUpload({uri: request.body.uri})});
});
// curl -X DELETE localhost:8886/uploads/384440a6-2bca-48c2-b9ef-768ab052eb0b
app.delete('/uploads/:id', async (request, response) => {
  await controller.deleteUpload(request.params.id);
  response.sendStatus(200);
});

console.log(`listening on http://localhost:${options.port}`);

app.listen(options.port);

setInterval(async () => {
  try {
    (await repo.getAllUploads()).filter(elem => {
      return elem.status === 'ok';
    }).forEach(async elem => {
      if (elem.stage === 'initialized') {
        await controller.startCompression(elem);
      }
    });
  } catch (err) {
    console.log(err.Error || err);
  }
}, 10000);
