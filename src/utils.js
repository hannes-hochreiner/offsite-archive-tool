import {spawn} from 'child_process';
import {randomBytes} from 'crypto';

export function getRandomString(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTXYZ1234567890';

  return new Promise((res, rej) => {
    randomBytes(length, (err, buf) => {
      if (err) {
        rej(err);
        return;
      }

      let pw = '';

      for (let b of buf) {
        let idx = Math.round(b / 255 * chars.length);

        if (idx > chars.length - 1) {
          idx = 0;
        }

        pw += chars[idx];
      }

      res(pw);
    });
  });
}

export function get7zProcesses(sshUser, sshIdFile, host) {
  return new Promise((res, rej) => {
    let proc = spawn('ssh', ['-i', sshIdFile, `${sshUser}@${host}`, "ps -Ao pid,fname"]);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('exit', (code, signal) => {
      if (code !== 0) {
        rej(stderr);
        return;
      }

      res(stdout.split('\n').filter(entry => {
        return entry.trim() !== '' && entry.endsWith('7z');
      }));
    });
  });
}

export function create7zArchive(sshUser, sshIdFile, host, uploadId, uploadUri, password) {
  return new Promise((res, rej) => {
    let archiveFilename = `${uploadId}.7z`;
    let archiveLogFilename = `${uploadId}.log`;
    let proc = spawn('ssh', [
      '-i',
      sshIdFile,
      `${sshUser}@${host}`,
      `7z a -t7z -mhe=on -p${password} ~/${archiveFilename} ${uploadUri} </dev/null &>~/${archiveLogFilename} &`
    ]);
    let stderr = '';

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('exit', (code) => {
      if (code !== 0) {
        rej(stderr);
        return;
      }

      res({archiveFilename: archiveFilename, archiveLogFilename: archiveLogFilename});
    });
  });
}
