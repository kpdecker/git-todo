var _ = require('underscore'),
    async = require('async'),
    childProcess = require('child_process'),
    path = require('path');

module.exports = function(dir, callback) {
  childProcess.exec('find ' + dir + ' -name ".git"', function(err, stdout) {
    if (err) {
      return callback(err);
    }

    var files = stdout.trim().split(/\n/g).map(path.dirname),
        repos = {};

    async.eachLimit(files, 10, function(file, callback) {
      isSubmodule(file, function(isSubmodule) {
        if (isSubmodule) {
          return callback();
        }

        var fetch = childProcess.exec('git fetch origin', {cwd: file, stdio: 'ignore', timeout: 30000}, function(err) {
          // Ignoring error for cases where there is no upstream.

          if (err && fetch.killed) {
            console.error('timeout: ' + file);
          }

          branchInfo(file, function(err, info) {
            if (err) {
              return callback(err);
            }

            if (/github\.com.*[:\/](.+)\/(.*)\.git$/.test(info.remote)) {
              info.name = RegExp.$1 + '/' + RegExp.$2;
            } else {
              info.name = file;
            }

            aheadBehind(info.branch, file, true, function(err, aheadBehind) {
              if (err) {
                return callback(err);
              }

              _.extend(info, aheadBehind);

              localStatus(file, function(err, status) {
                if (err) {
                  return callback(err);
                }

                info.path = file;
                info.status = status;
                repos[info.name] = info;

                callback();
              });
            });
          });
        });
      });
    },
    function(err) {
      callback(err, repos);
    });
  });
};

function isSubmodule(file, callback) {
  childProcess.exec('git rev-parse --is-inside-work-tree', {cwd: path.dirname(file)}, function(err, stdout) {
    callback(/true/.test(stdout));
  });
}

function branchInfo(path, callback) {
  childProcess.exec('git remote -v', {cwd: path}, function(err, remote) {
    if (err) {
      return callback(new Error('git.remote: ' + path + ' ' + err.message));
    }

    remote = (/origin\s+(.*) \(fetch\)/.exec(remote) || [])[1];

    childProcess.exec('git branch', {cwd: path}, function(err, branch) {
      if (err) {
        return callback(new Error('git.branch: ' + path + ' ' + err.message));
      }

      branch = (/\* (.*)/.exec(branch) || [])[1];
      if (/^\((?:detached|no branch)/.test(branch)) {
        branch = undefined;
      }

      callback(undefined, {remote: remote, branch: branch});
    });
  });
}
function aheadBehind(branch, path, behind, callback) {
  if (!branch) {
    return callback(undefined, {});
  }

  childProcess.exec('git rev-list origin/' + branch + '..' + branch + ' --', {cwd: path}, function(err, ahead) {
    if (err) {
      if (/bad revision/.test(err.message)) {
        return callback(undefined, {localBranch: true});
      } else {
        return callback(new Error('git.ahead: ' + path + ' ' + err.message));
      }
    }

    ahead = ahead.split('\n').length - 1;

    if (!behind) {
      return callback(undefined, {ahead: ahead});
    }

    childProcess.exec('git rev-list ' + branch + '..origin/' + branch + ' --', {cwd: path}, function(err, behind) {
      if (err) {
        return callback(new Error('git.behind: ' + path + ' ' + err.message));
      }

      behind = behind.split('\n').length - 1;
      callback(undefined, {ahead: ahead, behind: behind});
    });
  });
}

var STATUS_MAP = {
  'A': 'added',
  'M': 'modified',
  'D': 'deleted',
  'R': 'modified',
  'C': 'modified',
  '?': 'untracked',
  'U': 'modified'
};

function localStatus(path, callback) {
  childProcess.exec('git status --porcelain', {cwd: path}, function(err, stdout) {
    if (err) {
      return callback(new Error('git.status ' + path + ': ' + err.message));
    }

    var lines = stdout.trim().split('\n'),
        counter = {added: 0, modified: 0, deleted: 0, untracked: 0};

    lines = _.filter(lines, function(line) { return line; });
    _.each(lines, function(line) {
      var index = STATUS_MAP[line[0]],
          workDir = STATUS_MAP[line[1]],
          status = [index, workDir].sort();

      if (status[0]) {
        counter[status[0]]++;
      }
    });

    callback(undefined, counter);
  });
}
