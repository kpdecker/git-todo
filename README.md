# git-todo

Git repository status scanner.

Checks github for:
- Open pull requests
- Commits to master since the last semver tag

Checks all git repositories in a given directory for:
- Modified files
- Unpushed changes
- Unpulled changes


# Installation

```javascript
module.exports = {
  auth: 'oauth',
  token: 'OAuth Token generated from GitHub Admin',

  repoFilter: function(repo) {
    if (repo.owner.login === 'kpdecker') {
      return /jsdiff/.test(repo.name);
    } else {
      return true;
    }
  }
};
```

# Usage

```sh
git-todo [local dir name ...]
```
