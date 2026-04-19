import { execFileSync, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../');
const scriptPath = path.join(rootDir, 'scripts/issue_dev_token.py');

export function getPythonCommand(platform = process.platform) {
  return platform === 'win32' ? 'python' : 'python3';
}

export function buildPythonPath(root, existingPath = '', platform = process.platform) {
  const delimiter = platform === 'win32' ? ';' : ':';
  if (!existingPath) {
    return root;
  }
  return `${root}${delimiter}${existingPath}`;
}

export function getViteArgs(extraArgs = []) {
  return ['vite', ...extraArgs];
}

export function issueDevToken() {
  const python = getPythonCommand();
  const env = {
    ...process.env,
    PYTHONPATH: buildPythonPath(rootDir, process.env.PYTHONPATH, process.platform),
  };

  return execFileSync(python, [scriptPath], {
    encoding: 'utf8',
    env,
  }).trim();
}

export function startDevServer() {
  console.log('--- AgentForge Dev Injection ---');
  console.log('Generating dev token...');

  try {
    const token = issueDevToken();
    if (!token) {
      throw new Error('Token generation returned empty string');
    }

    console.log('Token generated successfully. Injecting into Vite environment...');

    const viteProcess = spawn('npx', getViteArgs(process.argv.slice(2)), {
      stdio: 'inherit',
      env: {
        ...process.env,
        VITE_DEV_JWT_TOKEN: token,
      },
      shell: process.platform === 'win32',
    });

    viteProcess.on('error', (err) => {
      console.error('Failed to start Vite:', err);
      process.exit(1);
    });

    viteProcess.on('close', (code) => {
      process.exit(code || 0);
    });
  } catch (error) {
    console.error('CRITICAL ERROR: Failed to generate dev token.');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startDevServer();
}
