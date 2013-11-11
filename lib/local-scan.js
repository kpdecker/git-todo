var _ = require('underscore'),
    async = require('async'),
    childProcess = require('child_process'),
    path = require('path');

module.exports = function(dir, options, callback) {
  if (!dir) {
    return callback();
  }

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

        var fetch = childProcess.exec('git fetch -k origin', {cwd: file, stdio: 'ignore', timeout: 30000}, function(err) {
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

            if (options.localFilter && !options.localFilter(info.remote)) {
              return callback();
            }

            if (!info.branch) {
              info.localBranch = true;
            } else {
              _.extend(info, info.branches[info.branch]);
            }

            localStatus(file, function(err, status) {
              if (err) {
                return callback(err);
              }

              info.path = file;
              info.status = status;

              unmergedBranches(file, function(err, branches) {
                if (err) {
                  return callback(err);
                }

                if (branches.length) {
                  var unmergedBranches = info.unmergedBranches = {};
                  _.each(branches, function(branch) {
                    unmergedBranches[branch] = info.branches[branch];
                  });
                }

                stashes(file, function(err, stashCount) {
                  if (err) {
                    return callback(err);
                  }

                  info.stashes = stashCount;
                  repos[info.name] = info;

                  callback();
                });
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

function unmergedBranches(path, callback) {
  childProcess.exec('git branch --no-merged', {cwd: path}, function(err, branches) {
    if (err) {
      if (/malformed object name HEAD/.test(err.message)) {
        // We are probably on a clean repo, ignore
        return callback(undefined, []);
      } else {
        return callback(new Error('git.unmerged: ' + path + ' ' + err.message));
      }
    }

    branches = branches.trim().split(/\n/).map(function(branch) { return branch.trim(); });
    branches = _.filter(branches, function(branch) { return branch; });
    callback(undefined, branches);
  });
}

function branchInfo(path, callback) {
  childProcess.exec('git remote -v', {cwd: path}, function(err, remote) {
    if (err) {
      return callback(new Error('git.remote: ' + path + ' ' + err.message));
    }

    remote = (/origin\s+(.*) \(fetch\)/.exec(remote) || [])[1];

    childProcess.exec('git branch -vv', {cwd: path}, function(err, branch) {
      if (err) {
        return callback(new Error('git.branch: ' + path + ' ' + err.message));
      }

      var branches = {},
          current;
      _.each(branch.split(/\n/g), function(branch) {
        var origin = branch;
        branch = (/(\*?) +([^ \(]+|\(.+\))[^[]*(\[.+\])?/.exec(branch) || []);
        if (!branch[2] || /^\((?:detached|no branch)/.test(branch[2])) {
          branch = undefined;
        } else {
          if (branch[1]) {
            current = branch[2];
          }

          branches[branch[2]] = {
            localBranch: !branch[3],
            behind: parseInt((/behind (\d+)/.exec(branch[3]) || [])[1] || 0),
            ahead: parseInt((/ahead (\d+)/.exec(branch[3]) || [])[1] || 0)
          };
        }
      });

      callback(undefined, {remote: remote, branch: current, branches: branches});
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

function stashes(path, callback) {
  childProcess.exec('git stash list', {cwd: path}, function(err, stdout) {
    if (err) {
      return callback(new Error('git.stash ' + path + ': ' + err.message));
    }

    var lines = stdout.trim().split(/\n/g);
    if (!lines[0] || /No stash found/.test(lines[0])) {
      lines = [];
    }
    callback(undefined, lines.length);
  });
}
