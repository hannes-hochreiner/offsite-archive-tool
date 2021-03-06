import { spawn, exec } from 'child_process';
import { randomBytes, createHash } from 'crypto';
import { readFile as rf, stat, open, read, close } from "fs";
import { default as uuidv4 } from "uuid/v4";

export class Utils {
  constructor() {
    this.uuid = uuidv4;
  }

  sha256sum(data) {
    let hash = createHash('sha256');
    let d = data;

    if (typeof d === 'string') {
      d = Buffer.from(d, 'hex');
    }

    hash.update(d);

    return hash.digest('hex');
  }

  closeFd(fd) {
    return new Promise((resolve, reject) => {
      close(fd, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  readFromFd(fd, start, length) {
    return new Promise((resolve, reject) => {
      let buf = new Buffer(length);

      read(fd, buf, 0, length, start, (error, bytesRead, buffer) => {
        if (error) {
          reject(error);
          return;
        }

        if (bytesRead !== length) {
          reject(`size mismatch: expected to read ${length} bytes; read ${bytesRead}`);
        }

        resolve(buffer);
      });
    });
  }

  getFd(filename) {
    return new Promise((resolve, reject) => {
      open(filename, 'r', (error, fd) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(fd);
      });
    });
  }

  getTimestamp() {
    return (new Date()).toISOString();
  }

  statFile(path) {
    return new Promise((resolve, reject) => {
      stat(path, (error, st) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(st);
      });
    });
  }

  readFile(path) {
    return new Promise((resolve, reject) => {
      rf(path, {encoding: 'utf8'}, (error, data) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(data);
      });
    });
  }

  getRandomString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTXYZ1234567890';
  
    return new Promise((resolve, reject) => {
      randomBytes(length, (err, buf) => {
        if (err) {
          reject(err);
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
  
        resolve(pw);
      });
    });
  }

  spawnDetached(command, args) {
    return new Promise((resolve, reject) => {
      let proc = spawn(command, args, {
        detached: true,
        stdio: 'ignore'
      });

      proc.unref();

      resolve(proc.pid.toString());
    });
  }

  spawnRemoteCommand(ssh, command) {
    return new Promise((resolve, reject) => {
      let proc = spawn('ssh', [
        '-i',
        ssh.idFile,
        `${ssh.user}@${ssh.host}`,
        command
      ]);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data;
      });
      
      proc.stderr.on('data', (data) => {
        stderr += data;
      });
      
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(stderr);
          return;
        }

        resolve(stdout);
      });
    });
  }

  execCommand(command) {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject({
            error: error,
            stderr: stderr
          });
          return;
        }

        resolve(stdout);
      });
    });
  }
}
