// pnpm configuration
module.exports = {
  hooks: {
    readPackage(pkg) {
      return pkg;
    }
  }
};
