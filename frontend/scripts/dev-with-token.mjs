import { execSync, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../');
const scriptPath = path.join(rootDir, 'scripts/issue_dev_token.py');

console.log('--- AgentForge Dev Injection ---');
console.log('Generating dev token...');

try {
  // Execute the python script and capture stdout
  // Use PYTHONPATH to ensure imports work if run from frontend dir
  const token = execSync(`export PYTHONPATH=$PYTHONPATH:${rootDir} && python3 ${scriptPath}`, {
    encoding: 'utf8',
    env: { ...process.env, PYTHONPATH: rootDir }
  }).trim();

  if (!token) {
    throw new Error('Token generation returned empty string');
  }

  console.log('Token generated successfully. Injecting into Vite environment...');

  // Inject token into VITE_DEV_JWT_TOKEN environment variable
  const viteProcess = spawn('npx', ['vite', '--port', '3000'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DEV_JWT_TOKEN: token
    }
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
  console.error(error.message);
  process.exit(1);
}
