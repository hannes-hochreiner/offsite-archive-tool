import { Controller } from "../bld/Controller";

describe('Controller', () => {
  it('should be able to get the change time of a remote file', async () => {
    let conf = {
      ssh: {
        user: 'test',
        idFile: 'test_id_rsa',
        host: 'testHost'
      }
    };
    let utils = jasmine.createSpyObj('utils', ['exec']);

    utils.exec.and.returnValue(Promise.resolve({stdout: '-rw-r--r-- 1 ob users 77934 2018-08-11 11:02:52.869565466 +0200 testfile\n'}));

    let ctrllr = new Controller(null, conf, utils);
    let res = await ctrllr._getChangeTimeOfRemoteFile('testfile');

    expect(res).toBe('2018-08-11T09:02:52.869Z');
  });
});
