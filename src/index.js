import {default as express} from 'express';
import {default as bodyParser} from 'body-parser';
import {default as commandLineArgs} from 'command-line-args';
import {default as PouchDB} from 'pouchdb';
import {default as Glacier} from 'aws-sdk/clients/glacier';
import { readFileSync } from 'fs';
import { homedir } from 'os';

import { Repo } from './Repo';
import { Controller } from './Controller';
import { Utils } from "./Utils";

const options = commandLineArgs([
  {name: 'aws_access_key', alias: 'a', type: String},
  {name: 'port', alias: 'p', type: Number, defaultValue: 8886},
  {name: 'interval', alias: 'i', type: Number, defaultValue: 60000},
  {name: 'configuration', alias: 'c', type: String, defaultValue: `${homedir()}/.config/offsite-archive-tool/offsite-archive-tool.json`}
]);

if (!options.aws_access_key) {
  console.error('no aws access key provided');
  process.exit(1);
}

let conf = JSON.parse(readFileSync(options.configuration, {encoding: 'utf8'}));

conf.aws.credentials.secretAccessKey = options.aws_access_key;

let pdb = new PouchDB(`${conf.workingDirectory}/oat_pdb`);
let repo = new Repo(pdb);
let utils = new Utils();
let glacier = new Glacier({
  apiVersion: '2012-06-01',
  region: conf.aws.region, 
  credentials: conf.aws.credentials
});
let controller = new Controller(repo, conf, utils, glacier);
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
    controller.doPeriodicCheck();
  } catch (err) {
    console.log(err.Error || err);
  }
}, options.interval);
