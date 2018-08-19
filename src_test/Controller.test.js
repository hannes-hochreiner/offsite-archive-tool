import { Controller } from "../bld/Controller";

describe('Controller', () => {
  let conf, repo, utils, glacier = null;

  beforeEach(() => {
    conf = {
      workingDirectory: 'testDirectory',
      ssh: {
        user: 'test',
        idFile: 'test_id_rsa',
        host: 'testHost'
      },
      aws: {
        region: 'testRegion',
        credentials: {
          accessKeyId: 'testAccessKeyId',
          secretAccessKey: 'testSecretAccessKey'
        },
        vaultName: 'testVaultName'
      }
    };
    utils = jasmine.createSpyObj('utils', ['readFromFd', 'sha256sum', 'closeFd', 'getFd', 'getTimestamp', 'uuid', 'statFile', 'spawnDetached', 'spawnRemoteCommand', 'getRandomString']);
    repo = jasmine.createSpyObj('repo', ['putUpload', 'putUploadPart']);
    glacier = jasmine.createSpyObj('glacier', ['initiateMultipartUpload']);
  });

  it('should be able to start the transfer', async () => {
    utils.spawnDetached.and.returnValue(Promise.resolve('1234\n'));

    let ctrllr = new Controller(repo, conf, utils, glacier);

    await ctrllr.startTransfer({
      id: 'testId',
      compression: {
        filename: 'testFile.7z'
      }
    });

    expect(utils.spawnDetached).toHaveBeenCalledWith('scp', [
      '-i',
      'test_id_rsa',
      'test@testHost:testFile.7z',
      'testDirectory/testFile.7z'
    ]);
    expect(repo.putUpload).toHaveBeenCalledWith({
      id: 'testId',
      stage: 'transferring',
      compression: {
        filename: 'testFile.7z'
      },
      transfer: {
        filename: 'testDirectory/testFile.7z',
        pid: '1234'
      }
    });
  });

  it('should be able to trigger the compression of a remote file', async () => {
    utils.getRandomString.and.returnValue(Promise.resolve('12345678901234567890'));
    utils.spawnRemoteCommand.and.returnValue(Promise.resolve('1234\n'));

    let ctrllr = new Controller(repo, conf, utils, glacier);

    await ctrllr.startCompression({
      id: 'testId',
      uri: 'testUri'
    });

    expect(utils.getRandomString).toHaveBeenCalledWith(20);
    expect(utils.spawnRemoteCommand).toHaveBeenCalledWith(
      conf.ssh,
      '7z a -t7z -mhe=on -p12345678901234567890 testId.7z testUri </dev/null &>testId.log & echo $!'
    );
    expect(repo.putUpload).toHaveBeenCalledWith({
      id: 'testId',
      uri: 'testUri',
      stage: 'compressing',
      compression: {
        password: '12345678901234567890',
        filename: 'testId.7z',
        logFilename: 'testId.log',
        pid: '1234'
      }
    });
  });

  it('should be able to trigger the hashing of a remote file', async () => {
    utils.spawnRemoteCommand.and.returnValue(Promise.resolve('1234\n'));

    let ctrllr = new Controller(repo, conf, utils, glacier);

    await ctrllr.startHashing({
      id: 'testId',
      compression: {
        filename: 'testId.7z'
      }
    });

    expect(utils.spawnRemoteCommand).toHaveBeenCalledWith(conf.ssh, 'sha256sum -b testId.7z </dev/null &>testId.hash & echo $!');
    expect(repo.putUpload).toHaveBeenCalledWith({
      id: 'testId',
      stage: 'hashing',
      compression: {
        filename: 'testId.7z'
      },
      hashing: {
        filename: 'testId.hash',
        pid: '1234'
      }
    });
  });

  it('should calculate the correct part size', () => {
    let ctrllr = new Controller(repo, conf, utils, glacier);
    let mega = 1024 * 1024;

    expect(ctrllr._calculatePartSize(20000 * mega)).toEqual(2 * mega);
    expect(ctrllr._calculatePartSize(20005 * mega)).toEqual(4 * mega);
    expect(ctrllr._calculatePartSize(20589 * mega)).toEqual(4 * mega);
    expect(ctrllr._calculatePartSize(40589 * mega)).toEqual(8 * mega);
    expect(ctrllr._calculatePartSize(30589 * mega)).toEqual(4 * mega);
    expect(() => {ctrllr._calculatePartSize(5000 * 10000 * mega)}).toThrow(new Error('file too large'));
    expect(ctrllr._calculatePartSize(200)).toEqual(mega);
    expect(ctrllr._calculatePartSize(10001 * mega)).toEqual(2 * mega);
  });

  it('should be able to trigger the the upload', async () => {
    utils.statFile.and.returnValue(Promise.resolve({size: 1.234 * 1024 * 1024}));
    utils.getTimestamp.and.returnValues('timestamp1', 'timestamp2');
    utils.uuid.and.returnValues('uuTestId1', 'uuTestId2');
    glacier.initiateMultipartUpload.and.returnValue({
      promise: () => {
        return Promise.resolve({
          location: 'awsLocationTest',
          uploadId: 'awsUploadIdTest'
        });
      }
    });

    let ctrllr = new Controller(repo, conf, utils, glacier);

    await ctrllr.startUpload({
      id: 'testId',
      transfer: {
        filename: '/home/test/testId.7z'
      }
    });

    expect(utils.statFile).toHaveBeenCalledWith('/home/test/testId.7z');
    expect(glacier.initiateMultipartUpload).toHaveBeenCalledWith({
      accountId: "-", 
      partSize: `${1024 * 1024}`, 
      vaultName: 'testVaultName'
    });
    expect(repo.putUpload).toHaveBeenCalledWith({
      id: 'testId',
      transfer: {
        filename: '/home/test/testId.7z'
      },
      upload: {
        size: 1.234 * 1024 * 1024,
        partSize: 1024 * 1024,
        aws: {
          location: 'awsLocationTest',
          uploadId: 'awsUploadIdTest'
        }
      },
      stage: 'uploading'
    });
    expect(repo.putUploadPart).toHaveBeenCalledTimes(2);
    expect(repo.putUploadPart.calls.argsFor(0)[0]).toEqual({
      id: 'uuTestId1',
      uploadId: 'testId',
      aws: {
        uploadId: 'awsUploadIdTest',
        vaultName: 'testVaultName'
      },
      start: 0,
      end: 1024 * 1024 - 1,
      status: 'initialized',
      log: [{timestamp: 'timestamp1', message: 'initialized'}]
    });
    expect(repo.putUploadPart.calls.argsFor(1)[0]).toEqual({
      id: 'uuTestId2',
      uploadId: 'testId',
      aws: {
        uploadId: 'awsUploadIdTest',
        vaultName: 'testVaultName'
      },
      start: 1024 * 1024,
      end: 1.234 * 1024 * 1024 - 1,
      status: 'initialized',
      log: [{timestamp: 'timestamp2', message: 'initialized'}]
    });
  });

  it('should calculate the correct tree hash', async () => {
    utils.getFd.and.returnValue(Promise.resolve(12));
    utils.readFromFd.and.returnValues(Promise.resolve('data1'), Promise.resolve('data2'), Promise.resolve('data3'));
    utils.sha256sum.and.returnValues('hash1', 'hash2', 'hash3', 'hash1_hash2', 'hash1_hash2_hash3');
    // utils.closeFd;

    let ctrllr = new Controller(repo, conf, utils, glacier);

    let res = await ctrllr._calculateTreeHashOfFile({
      compression: {
        filename: 'testCompressionFilename'
      },
      upload: {
        size: 1024 * 1024 * 2 + 1024
      }
    });

    expect(utils.getFd.calls.argsFor(0)).toEqual(['testDirectory/testCompressionFilename']);
    expect(utils.readFromFd.calls.argsFor(0)).toEqual([12, 0, 1024 * 1024]);
    expect(utils.readFromFd.calls.argsFor(1)).toEqual([12, 1024 * 1024, 1024 * 1024]);
    expect(utils.readFromFd.calls.argsFor(2)).toEqual([12, 1024 * 1024 * 2, 1024]);
    expect(utils.sha256sum.calls.argsFor(0)).toEqual(['data1']);
    expect(utils.sha256sum.calls.argsFor(1)).toEqual(['data2']);
    expect(utils.sha256sum.calls.argsFor(2)).toEqual(['data3']);
    expect(utils.sha256sum.calls.argsFor(3)).toEqual(['hash1hash2']);
    expect(utils.sha256sum.calls.argsFor(4)).toEqual(['hash1_hash2hash3']);
    expect(res, 'hash1_hash2_hash3');
  });
});
