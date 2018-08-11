import { Controller } from "../bld/Controller";

describe('Controller', () => {
  let conf, repo, utils = null;

  beforeEach(() => {
    conf = {
      ssh: {
        user: 'test',
        idFile: 'test_id_rsa',
        host: 'testHost'
      }
    };
    utils = jasmine.createSpyObj('utils', ['spawnRemoteCommand', 'getRandomString']);
    repo = jasmine.createSpyObj('repo', ['putUpload']);
  });

  it('should be able to trigger the compression of a remote file', async () => {
    utils.getRandomString.and.returnValue(Promise.resolve('12345678901234567890'));
    utils.spawnRemoteCommand.and.returnValue(Promise.resolve('1234\n'));

    let ctrllr = new Controller(repo, conf, utils);

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

    let ctrllr = new Controller(repo, conf, utils);

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
});
