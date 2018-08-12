import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { default as uuidv4 } from "uuid/v4";

export class Utils {
  constructor() {
    this.uuid = uuidv4;
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
}
