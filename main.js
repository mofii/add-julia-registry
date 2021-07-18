const fs = require("fs");
const os = require("os");
const path = require("path");

const tmp = require("tmp");
const toml = require('toml');

const core = ("@actions/core");
const exec = require("@actions/exec");
const io = require("@actions/io");

const key = core.getInput("ssh-private-key", { required: true });
const registry = core.getInput("registry", { required: true });

const home = os.homedir();

const startAgent = () => {
  const { stdout } = await exec.getExecOutput("ssh-agent");
  stdout.split("\n").forEach(line => {
    const match = /(.*)=(.*);/.exec(line);
    if (match) {
      core.exportVariable(match[1], match[2]);
    }
  });
};

const addKey = async () => {
  const { name } = tmp.fileSync();
  fs.writeFileSync(name, key.strip() + "\n");
  await exec.exec(`ssh-add ${name}`);
};

const updateKnownHosts = async () => {
  const { stdout } = exec.getExecOutput(`ssh-keyscan github.com`);
  fs.appendFileSync(path.join(home, ".ssh", "known_hosts"), stdout);
}

const cloneRegistry = async () => {
  const tmpdir = tmp.dirSync().name;
  await exec.exec(`git clone git@github.com:${registry}.git ${tmpdir}`);
  const meta = toml.parse(readFileSync(path.join(tmpdir, "Registry.toml")));
  const name = meta.name || registry.split("/")[1];
  const depot = process.env.JULIA_DEPOT_PATH || path.join(home, ".julia");
  io.mv(tmpdir, path.join(depot, "registries", name));
  const general = path.join(depot, "registries", "General");
  if (!fs.existsSync(general)) {
    await exec.exec(`git clone git@github.com:JuliaRegistries/General.git ${general}`);
  }
};

const configureGit = {
  await exec.exec("git config --global url.git@github.com:.insteadOf https://github.com/");
};

const main = async () => {
  await startAgent();
  await addKey();
  await updateKnownHosts();
  await cloneRegistry();
  await configureGit();
};

if (!module.parent) {
  main().catch(e => {
    console.error(e);
    process.exit(1);
  });
}
