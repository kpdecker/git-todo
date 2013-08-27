var _ = require('underscore'),
    async = require('async'),
    Github = require('github-api'),
    semver = require('semver');

module.exports = function(options, callback) {
  var github = new Github(options),
      user = github.getUser(),

      status = {};

  async.parallel([
      function(callback) {
        user.repos(function(err, userRepos) {
          if (err) {
            return callback(err);
          }

          if (options.repoFilter) {
            userRepos = _.filter(userRepos, options.repoFilter);
          }

          loadRepos(github, userRepos, function(err, data) {
            _.extend(status, data);

            callback(err);
          });
        });
      },
      function(callback) {
        user.orgs(function(err, orgs) {
          if (err) {
            return callback(err);
          }

          async.each(orgs, function(org, callback) {
            org = org.login;
            user.orgRepos(org, function(err, orgRepos) {
              if (options.repoFilter) {
                orgRepos = _.filter(orgRepos, options.repoFilter);
              }

              loadRepos(github, orgRepos, function(err, data) {
                _.extend(status, data);

                callback(err);
              });
            });
          },
          callback);
        });
      }
    ],
    function(err) {
      callback(err, status);
    });
};

function loadRepos(github, remoteRepos, callback) {
  var status = {};
  async.each(remoteRepos, function(repoJSON, callback) {
      loadRepo(github, repoJSON, function(err, info) {
        if (err) {
          return callback(err);
        }

        status[info.name] = info;
        callback();
      });
    },
    function(err) {
      callback(err, status);
    });
}
function loadRepo(github, repoJSON, callback) {
  var status = {
    name: repoJSON.full_name,
    remote: repoJSON.git_url
  };

  var repo = github.getRepo(repoJSON.owner.login, repoJSON.name);
  async.parallel([
      function(callback) {
        if (repoJSON.fork) {
          // Do not examine version logs for forks
          return callback();
        }

        latestVersion(repo, function(err, latestVersion) {
          if (!latestVersion || err) {
            return callback(err);
          }

          status.latest = latestVersion.name;
          repo.compare(status.latest, 'master', function(err, data) {
            if (err) {
              return callback(err);
            }

            var commits = _.map(data.commits, function(commit) {
              return {
                sha: commit.sha,
                committer: commit.author ? commit.author.login : commit.commit.author.name,
                message: commit.commit.message.replace(/\n(.|\n)*/g, '')
              };
            });
            if (commits.length) {
              status.commits = commits;
            }
            callback();
          });
        });
      },
      function(callback) {
        if (repoJSON.open_issues_count > 0) {
          repo.listPulls(function(err, pulls) {
            pulls = _.map(pulls, function(pull) {
              return {
                number: pull.number,
                committer: pull.user.login,
                message: pull.title
              };
            });

            if (pulls.length) {
              status.pulls = pulls;
            }

            callback();
          });
        } else {
          callback();
        }
      }
    ],
    function(err) {
      callback(err, status);
    });
}

function latestVersion(repo, callback) {
  repo.listTags(function(err, tags) {
    var versions = _.filter(tags || [], function(tag) { return /^v/.test(tag.name); });
    versions = versions.sort(function(a, b) {
      if (!semver.valid(a.name)) {
        return 1;
      } else if (!semver.valid(b.name)) {
        return -1;
      } else {
        return semver.gt(a.name, b.name) ? -1 : 1;
      }
    });

    callback(err, versions[0]);
  });
}

