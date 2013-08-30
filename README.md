# git-todo

Git repository status scanner.

Checks github for:
- Open pull requests
- Commits to master since the last semver tag

Checks all git repositories in a given directory for:
- Modified files
- Unpushed changes
- Unpulled changes


## Installation

```
npm install -g git-todo
```

A config file needs to be created in `~/.config/git-todo`. This is standard CommonJS module exporting the options listed below. 

### Options

- Github authentication [options](https://github.com/michael/github#usage).
- (optional) `repoFilter` : Method used to filter server-side repos from the status results.

### Example

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

## Usage

```sh
git-todo [local dir name ...]
```
