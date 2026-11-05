const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 24 || (major === 24 && minor < 14)) {
  console.error('GEO Check requires Node.js >=24.14.0. Install a supported version before running npm commands.');
  process.exit(1);
}
